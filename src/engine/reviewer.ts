import { TaskStatus } from "@prisma/client";
import { completeForAgent } from "../ai/manager";
import { db } from "../lib/db";
import { AppError } from "../lib/errors";
import { logActivity } from "../lib/services/activity";
import { publishOfficeEvent } from "../realtime/publish";
import { truncate } from "./context";
import { parseReview, type Review } from "./plan";
import { budgetedResults, getReviewerAgent, markBusy, markFree } from "./quality";

export type ReviewOutcome = {
  /** Score reached the office's minimum; corrections are only applied when it didn't. */
  passed: boolean;
  score: number;
  criteria: Review["criteria"];
  observations: string;
  corrections: { subtaskOrder: number; instruction: string }[];
  reviewerName: string;
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
  minScore: number;
}): string {
  const deliverables = budgetedResults(input.subtasks)
    .map(
      (subtask) => `### Subtarea ${subtask.order}: ${subtask.title}
Responsable: ${subtask.agent}
Estado: ${subtask.status}
Entregable esperado: ${subtask.expectedDeliverable}
Resultado:
${subtask.text}`,
    )
    .join("\n\n");

  return `## Tarea original

Título: ${input.task.title}
Objetivo: ${input.task.objective}
Contexto: ${input.task.description || "Sin contexto adicional"}

## Entregables del equipo

${deliverables}

## Instrucciones de revisión (ronda ${input.round} de 2)

Puntúa de 0 a 10 cada criterio y da una nota global:
- objective: ¿cumple el objetivo de la tarea y el entregable esperado de cada subtarea?
- accuracy: ¿está libre de datos, cifras o fuentes inventadas y de contradicciones?
- usefulness: ¿el director puede usarlo tal cual para decidir o actuar?
- clarity: ¿está bien estructurado y es fácil de leer?

La nota mínima para entregar es ${input.minScore}. Si la nota global es menor, pide correcciones concretas y verificables (máximo una por subtarea, solo en las que fallan). Si llega a ${input.minScore}, deja "corrections" vacío: no bloquees por mejoras opcionales.${input.round === 2 ? " Es la última ronda: no habrá otra oportunidad de corrección." : ""}

Todos los entregables se entregan en Markdown. No penalices el formato salvo que la tarea exija otro de forma explícita.

Evalúa frente a lo que el equipo puede producir: solo texto, sin herramientas de métricas (volúmenes de búsqueda, analítica, redes) ni generación de imágenes, y leyendo únicamente las páginas web enlazadas. No penalices la ausencia de archivos de imagen o de métricas de herramientas de pago si el entregable lo declara y aporta una alternativa útil (brief y prompt de imagen, estimaciones marcadas como tales, cómo obtener el dato real). Sí penaliza con dureza los marcadores de posición y los datos inventados presentados como reales, y pide correcciones que el equipo pueda cumplir con esas capacidades.

Devuelve SOLO un objeto JSON válido, sin texto adicional ni bloques Markdown:

{
  "score": 8,
  "criteria": { "objective": 8, "accuracy": 9, "usefulness": 7, "clarity": 8 },
  "observations": "observaciones breves sobre la calidad global (máximo 5 frases)",
  "corrections": [
    { "subtaskOrder": 1, "instruction": "corrección concreta y verificable" }
  ]
}`;
}

export async function reviewTask(taskId: string, round: number, minScore: number): Promise<ReviewOutcome> {
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

  const reviewer = await getReviewerAgent();

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
    minScore,
  });

  await markBusy(reviewer.id);

  const run = await db.agentRun.create({
    data: {
      taskId,
      agentId: reviewer.id,
      providerId: reviewer.providerId,
      status: "RUNNING",
      attempt: round,
      iteration: round,
      model: reviewer.model,
      prompt,
      startedAt: new Date(),
    },
    select: { id: true },
  });

  const startedAt = Date.now();

  try {
    let result = await completeForAgent({
      agentId: reviewer.id,
      taskId,
      runId: run.id,
      system: reviewer.systemPrompt,
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: 1500,
      temperature: 0.1,
      responseFormat: "json",
    });

    let review: Review;
    try {
      review = parseReview(result.text);
    } catch {
      const repairPrompt = `La respuesta de revisión anterior no es JSON válido. Devuelve SOLO el objeto JSON corregido, sin markdown ni explicaciones. Debe tener "score" (número de 0 a 10), "criteria" (objeto), "observations" (string) y "corrections" (array).

Respuesta inválida a reparar:
${result.text.slice(0, 8000)}`;

      const repaired = await completeForAgent({
        agentId: reviewer.id,
        taskId,
        runId: run.id,
        system: reviewer.systemPrompt,
        messages: [{ role: "user", content: repairPrompt }],
        maxOutputTokens: 1500,
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

    const passed = review.score >= minScore;

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
            fromAgentId: reviewer.id,
            role: "USER",
            content: prompt,
            metadata: { kind: "review_request", round },
          },
          {
            taskId,
            runId: run.id,
            fromAgentId: reviewer.id,
            role: "ASSISTANT",
            content: result.text,
            metadata: { kind: "review_response", round, score: review.score, passed },
          },
        ],
      });

      if (!passed) {
        for (const correction of review.corrections) {
          const subtask = task.subtasks.find((item) => item.order === correction.subtaskOrder);
          if (!subtask) continue;

          await tx.agentMessage.create({
            data: {
              taskId,
              subtaskId: subtask.id,
              fromAgentId: reviewer.id,
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
          actorId: reviewer.id,
          action: "task.reviewed",
          entityType: "Task",
          entityId: taskId,
          metadata: {
            round,
            score: review.score,
            passed,
            corrections: review.corrections.length,
            observations: truncate(review.observations, 800),
          },
        },
        tx,
      );
    }, { maxWait: 10000, timeout: 30000 });

    await markFree(reviewer.id);

    void publishOfficeEvent({
      type: "task.reviewed",
      taskId,
      status: passed ? "APPROVED" : "CORRECTIONS",
      message: passed
        ? `${reviewer.name} aprobó los entregables (${review.score}/10)`
        : `${reviewer.name} puntuó ${review.score}/10 y pidió ${review.corrections.length} corrección(es)`,
    });

    return {
      passed,
      score: review.score,
      criteria: review.criteria,
      observations: review.observations,
      corrections: review.corrections,
      reviewerName: reviewer.name,
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

    await markFree(reviewer.id);

    throw error;
  }
}
