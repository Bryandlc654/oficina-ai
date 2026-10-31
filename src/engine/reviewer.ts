import { TaskStatus } from "@prisma/client";
import { completeForAgent } from "../ai/manager";
import { db } from "../lib/db";
import { AppError } from "../lib/errors";
import { logActivity } from "../lib/services/activity";
import { rememberLesson } from "../lib/services/agent-learning";
import { publishOfficeEvent } from "../realtime/publish";
import { isClientDocument } from "./client-document";
import { truncate } from "./context";
import { parseReview, type Review } from "./plan";
import { getReviewerAgent, markBusy, markFree } from "./quality";

// What the reviewer reads of the final document; longer documents are cut at the end.
const DOCUMENT_BUDGET = 24_000;

export type ReviewOutcome = {
  /** Score reached the office's minimum; corrections are only applied when it didn't. */
  passed: boolean;
  score: number;
  criteria: Review["criteria"];
  observations: string;
  corrections: string[];
  reviewerName: string;
};

function buildReviewPrompt(input: {
  task: { title: string; objective: string; description: string };
  document: string;
  round: number;
  minScore: number;
}): string {
  const clientDocument = isClientDocument(`${input.task.title} ${input.task.objective} ${input.task.description}`);

  return `## Pedido

Título: ${input.task.title}
Objetivo: ${input.task.objective}
Contexto: ${input.task.description || "Sin contexto adicional"}

## Documento final que recibirá el director

${truncate(input.document, DOCUMENT_BUDGET)}

## Instrucciones de revisión (ronda ${input.round} de 2)

Revisa el documento FINAL frente al pedido, como lo haría el director al abrirlo. Comprueba:
1. ¿Es exactamente lo que se pidió, en la forma pedida (un PDF de cotización es una cotización completa, un post es el post listo)?
2. ¿Están todas las partes que el pedido exige o que ese tipo de documento necesita?
3. ¿Las cifras son coherentes entre sí (los totales cuadran con el desglose)?
4. ¿Hay datos inventados presentados como reales, contradicciones o marcadores vacíos ([X], TBD)? Los campos del cliente entre corchetes para completar sí están permitidos.
5. ¿Se puede usar tal cual, sin rehacer nada?
${clientDocument ? "6. Al ser un documento para el cliente: ¿tiene tono profesional dirigido al cliente, precios en la moneda indicada, impuestos, condiciones de pago y validez, y ninguna nota interna?\n" : ""}
Puntúa de 0 a 10 cada criterio y da una nota global:
- objective: ¿cumple el pedido completo?
- accuracy: ¿está libre de datos inventados, errores de cálculo y contradicciones?
- usefulness: ¿el director puede usarlo tal cual?
- clarity: ¿está bien estructurado y es fácil de leer?

La nota mínima para entregar es ${input.minScore}. Si la nota global es menor, pide hasta 6 correcciones concretas y verificables sobre el documento ("añade la sección de condiciones de pago", "el total no cuadra: suma S/ 4.200, no S/ 4.500"). Si llega a ${input.minScore}, deja "corrections" vacío: no bloquees por mejoras opcionales.${input.round === 2 ? " Es la última ronda: no habrá otra corrección." : ""}

El equipo solo produce texto: no penalices la ausencia de imágenes o de métricas de herramientas de pago si el documento lo declara y aporta una alternativa útil. El documento se entrega en Markdown y la plataforma lo exporta a PDF: no penalices el formato.

Devuelve SOLO un objeto JSON válido, sin texto adicional ni bloques Markdown:

{
  "score": 8,
  "criteria": { "objective": 8, "accuracy": 9, "usefulness": 7, "clarity": 8 },
  "observations": "observaciones breves sobre la calidad global (máximo 4 frases)",
  "corrections": [{ "instruction": "corrección concreta y verificable" }]
}`;
}

export async function reviewTask(taskId: string, round: number, minScore: number, document: string): Promise<ReviewOutcome> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: {
      title: true,
      objective: true,
      description: true,
      status: true,
      subtasks: { select: { assignedAgentId: true } },
    },
  });

  if (!task) throw new AppError("La tarea no existe", 404, "NOT_FOUND");
  if (task.status === TaskStatus.CANCELLED) {
    throw new AppError("La tarea fue cancelada", 409, "CANCELLED");
  }

  const reviewer = await getReviewerAgent();

  let prompt = buildReviewPrompt({
    task: { title: task.title, objective: task.objective, description: task.description },
    document,
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
      purpose: "review",
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
      const repairPrompt = `La respuesta de revisión anterior no es JSON válido. Devuelve SOLO el objeto JSON corregido, sin markdown ni explicaciones. Debe tener "score" (número de 0 a 10), "criteria" (objeto), "observations" (string) y "corrections" (array de objetos con "instruction").

Respuesta inválida a reparar:
${result.text.slice(0, 8000)}`;

      const repaired = await completeForAgent({
        agentId: reviewer.id,
        purpose: "review",
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
    const corrections = passed ? [] : review.corrections.map((correction) => correction.instruction);
    const workers = new Set(
      task.subtasks.map((subtask) => subtask.assignedAgentId).filter((agentId) => agentId !== null),
    );

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
          ...corrections.map((instruction) => ({
            taskId,
            fromAgentId: reviewer.id,
            role: "USER" as const,
            content: instruction,
            metadata: { kind: "correction", round, target: "final_document" },
          })),
        ],
      });

      // Everyone who fed the document learns what fell short.
      for (const instruction of corrections) {
        for (const agentId of workers) {
          await rememberLesson(
            agentId,
            {
              content: `Control de calidad corrigió: ${instruction}`,
              importance: 2,
              source: `review:${taskId}`,
              kind: "qa_correction",
              taskId,
            },
            tx,
          );
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
            corrections: corrections.length,
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
        ? `${reviewer.name} aprobó el entregable (${review.score}/10)`
        : `${reviewer.name} puntuó ${review.score}/10 y pidió ${corrections.length} corrección(es)`,
    });

    return {
      passed,
      score: review.score,
      criteria: review.criteria,
      observations: review.observations,
      corrections,
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
