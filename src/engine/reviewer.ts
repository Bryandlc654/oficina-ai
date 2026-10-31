import { AgentStatus, TaskStatus } from "@prisma/client";
import { completeForAgent } from "../ai/manager";
import { db } from "../lib/db";
import { AppError } from "../lib/errors";
import { logActivity } from "../lib/services/activity";
import { publishOfficeEvent } from "../realtime/publish";
import { truncate } from "./context";
import { parseReview } from "./plan";

const PM_SLUG = "project-manager";

export type ReviewOutcome = {
  approved: boolean;
  observations: string;
  corrections: { subtaskOrder: number; instruction: string }[];
  finalReport: string;
};

function buildReviewPrompt(input: {
  task: { title: string; objective: string; description: string };
  subtasks: {
    order: number;
    title: string;
    status: string;
    expectedDeliverable: string;
    result: string | null;
    agent: string;
  }[];
  round: number;
}): string {
  const deliverables = input.subtasks
    .map(
      (subtask) => `### Subtarea ${subtask.order}: ${subtask.title}
Responsable: ${subtask.agent}
Estado: ${subtask.status}
Entregable esperado: ${subtask.expectedDeliverable}
Resultado:
${truncate(subtask.result ?? "Sin resultado", 2500)}`,
    )
    .join("\n\n");

  return `## Tarea original

Título: ${input.task.title}
Objetivo: ${input.task.objective}
Contexto: ${input.task.description || "Sin contexto adicional"}

## Entregables del equipo

${deliverables}

## Instrucciones de revisión (ronda ${input.round} de 2)

Revisa si los entregables cumplen el objetivo de la tarea y el entregable esperado de cada subtarea. Sé exigente pero no bloquees por mejoras opcionales. Si algo es insuficiente, pide una corrección concreta por subtarea (máximo una por subtarea). Esta es la ronda ${input.round}; en la ronda 2 no habrá otra oportunidad.

Devuelve SOLO un objeto JSON válido, sin texto adicional ni bloques Markdown:

{
  "approved": true,
  "observations": "observaciones breves sobre la calidad global",
  "corrections": [
    { "subtaskOrder": 1, "instruction": "corrección concreta y verificable" }
  ],
  "finalReport": "informe final consolidado para el director, en Markdown, con resultados, decisiones y limitaciones"
}

Reglas:
- Si no hay correcciones necesarias, "approved" debe ser true y "corrections" un arreglo vacío.
- Si pides correcciones, "approved" debe ser false.
- El "finalReport" siempre debe estar completo y ser útil para el director. Escríbelo en Markdown legible, con resumen ejecutivo y secciones claras.
- Todos los entregables se entregan en Markdown. No rechaces un trabajo por no ser PDF, DOCX o JSON salvo que la tarea lo exija de forma explícita; en ese caso, evalúa si el contenido está presente y señala la limitación de formato.
- Evalúa claridad para un lector humano, estructura, exactitud, consistencia entre entregables y utilidad para tomar decisiones.
- No inventes resultados que no estén en los entregables. Responde en español.`;
}

export async function reviewTask(taskId: string, round: number): Promise<ReviewOutcome> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    include: {
      subtasks: {
        orderBy: { order: "asc" },
        include: { assignedAgent: { select: { id: true, name: true } } },
      },
    },
  });

  if (!task) throw new AppError("La tarea no existe", 404, "NOT_FOUND");
  if (task.status === TaskStatus.CANCELLED) {
    throw new AppError("La tarea fue cancelada", 409, "CANCELLED");
  }

  const pm = await db.agent.findUnique({ where: { slug: PM_SLUG } });
  if (!pm) throw new AppError("No existe el Project Manager", 503, "PM_MISSING");

  let prompt = buildReviewPrompt({
    task: { title: task.title, objective: task.objective, description: task.description },
    subtasks: task.subtasks.map((subtask) => ({
      order: subtask.order,
      title: subtask.title,
      status: subtask.status,
      expectedDeliverable: subtask.expectedDeliverable,
      result: subtask.result,
      agent: subtask.assignedAgent?.name ?? "Sin asignar",
    })),
    round,
  });

  await db.agent.update({
    where: { id: pm.id },
    data: { status: AgentStatus.WORKING, currentSubtaskId: null },
  });

  const run = await db.agentRun.create({
    data: {
      taskId,
      agentId: pm.id,
      providerId: pm.providerId,
      status: "RUNNING",
      attempt: round,
      iteration: round,
      model: pm.model,
      prompt,
      startedAt: new Date(),
    },
    select: { id: true },
  });

  const startedAt = Date.now();

  try {
    let result = await completeForAgent({
      agentId: pm.id,
      taskId,
      runId: run.id,
      system: pm.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: 8000,
      temperature: 0.1,
      responseFormat: "json",
    });

    let review;
    try {
      review = parseReview(result.text);
    } catch {
      const repairPrompt = `La respuesta de revisión anterior no es JSON válido. Devuelve SOLO el objeto JSON corregido, sin markdown ni explicaciones. Debe tener "approved" (boolean), "observations" (string), "corrections" (array) y "finalReport" (string). Mantén el informe final conciso (máximo 1200 palabras) para que el JSON no se trunque.

Respuesta inválida a reparar:
${result.text.slice(0, 16000)}`;

      const repaired = await completeForAgent({
        agentId: pm.id,
        taskId,
        runId: run.id,
        system: pm.systemPrompt,
        messages: [{ role: "user", content: repairPrompt }],
        maxOutputTokens: 8000,
        temperature: 0,
        responseFormat: "json",
      });

      review = parseReview(repaired.text);
      result = {
        ...repaired,
        inputTokens: result.inputTokens + repaired.inputTokens,
        outputTokens: result.outputTokens + repaired.outputTokens,
        totalTokens: result.totalTokens + repaired.totalTokens,
      };
      prompt = `${prompt}\n\n## Reparación de JSON\n${repairPrompt}`;
    }

    await db.$transaction(async (tx) => {
      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCEEDED",
          prompt,
          output: result.text,
          providerId: result.providerId,
          model: result.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          latencyMs: Date.now() - startedAt,
          finishedAt: new Date(),
        },
      });

      await tx.agentMessage.createMany({
        data: [
          {
            taskId,
            runId: run.id,
            fromAgentId: pm.id,
            role: "USER",
            content: prompt,
            metadata: { kind: "review_request", round },
          },
          {
            taskId,
            runId: run.id,
            fromAgentId: pm.id,
            role: "ASSISTANT",
            content: result.text,
            metadata: { kind: "review_response", round, approved: review.approved },
          },
        ],
      });

      if (!review.approved) {
        for (const correction of review.corrections) {
          const subtask = task.subtasks.find((item) => item.order === correction.subtaskOrder);
          if (!subtask) continue;

          await tx.agentMessage.create({
            data: {
              taskId,
              subtaskId: subtask.id,
              fromAgentId: pm.id,
              toAgentId: subtask.assignedAgentId,
              role: "USER",
              content: correction.instruction,
              metadata: { kind: "correction", round },
            },
          });

          await tx.subtask.update({
            where: { id: subtask.id },
            data: { status: "PENDING", errorMessage: null },
          });
        }
      }

      await logActivity(
        {
          actorType: "AGENT",
          actorId: pm.id,
          action: "task.reviewed",
          entityType: "Task",
          entityId: taskId,
          metadata: {
            round,
            approved: review.approved,
            corrections: review.corrections.length,
            observations: truncate(review.observations, 800),
          },
        },
        tx,
      );

      await tx.agent.update({
        where: { id: pm.id },
        data: { status: AgentStatus.AVAILABLE, currentSubtaskId: null },
      });
    }, { maxWait: 10000, timeout: 30000 });

    void publishOfficeEvent({
      type: "task.reviewed",
      taskId,
      status: review.approved ? "APPROVED" : "CORRECTIONS",
      message: review.approved
        ? "El Project Manager aprobó los entregables"
        : `El Project Manager solicitó ${review.corrections.length} corrección(es)`,
    });

    return {
      approved: review.approved,
      observations: review.observations,
      corrections: review.corrections,
      finalReport: review.finalReport,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await db.agentRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: truncate(message, 4000),
        latencyMs: Date.now() - startedAt,
        finishedAt: new Date(),
      },
    }).catch(() => undefined);

    await db.agent.update({
      where: { id: pm.id },
      data: { status: AgentStatus.AVAILABLE, currentSubtaskId: null },
    }).catch(() => undefined);

    throw error;
  }
}
