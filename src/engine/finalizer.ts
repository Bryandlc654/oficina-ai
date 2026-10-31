import { completeForAgent } from "../ai/manager";
import { AIProviderError } from "../ai/types";
import { cleanReply } from "../lib/chat-format";
import { db } from "../lib/db";
import { CLIENT_DOCUMENT_CURRENCY, isClientDocument } from "./client-document";
import { truncate } from "./context";
import { budgetedResults, markBusy, markFree, PM_SLUG } from "./quality";
import type { ReviewOutcome } from "./reviewer";

const CRITERIA_LABELS: Record<string, string> = {
  objective: "Objetivo",
  accuracy: "Exactitud",
  usefulness: "Utilidad",
  clarity: "Claridad",
};

export function qualityHeader(
  review: Pick<ReviewOutcome, "score" | "criteria" | "observations" | "reviewerName"> | string,
): string {
  // A string is the reason the automatic review could not run.
  if (typeof review === "string") return `> **Control de calidad: revisión automática no disponible.**\n> ${review.replace(/\n+/g, " ")}`;
  const criteria = Object.entries(review.criteria)
    .map(([key, value]) => `${CRITERIA_LABELS[key] ?? key} ${value}/10`)
    .join(" · ");
  return `> **Control de calidad (${review.reviewerName}): ${review.score}/10**${criteria ? ` — ${criteria}` : ""}\n> ${review.observations.replace(/\n+/g, " ") || "Sin observaciones."}`;
}

// The deliverable is what was asked for (a post, a plan, an audit…), not a report about it.
const DIRECTOR_INSTRUCTIONS = `Escribe UN único entregable final: exactamente lo que se pidió en el objetivo y en el pedido original, con su forma natural (si pidieron publicaciones, las publicaciones listas; si pidieron un plan, el plan; si pidieron una auditoría, la auditoría).
- Empieza con \`# \` y un título claro, y abre con 2 o 3 líneas que digan qué contiene.
- Integra el trabajo del equipo en un solo documento coherente, sin repetir partes ni resumirlas en exceso. Aplica las observaciones de calidad.
- Cierra con "Próximos pasos" (máximo 5 viñetas) solo si ayudan a usarlo, y con "Supuestos" solo si se tomaron.
No inventes datos que no estén en el trabajo del equipo. No menciones subtareas, al equipo ni el proceso interno.`;

// The PDF goes to the client as is: no internal notes, no "for the director" sections.
const CLIENT_DOCUMENT_INSTRUCTIONS = `Escribe el documento COMPLETO que se enviará al cliente; se descargará tal cual en PDF.
- Empieza con \`# \` y el título del documento (por ejemplo "Cotización — Rediseño web"), seguido de una línea con fecha, validez y "Preparado para: [Nombre del cliente]".
- Para una cotización usa estas secciones \`##\`: Resumen del proyecto, Alcance y entregables, Cronograma (tabla por fases y semanas), Inversión (tabla con concepto, detalle y precio, con subtotal, IGV 18 % y total), Condiciones de pago, Validez de la cotización, Qué no incluye, Próximos pasos para aprobar. Adapta las secciones si es otro tipo de documento.
- Integra TODO el trabajo del equipo con cifras concretas y coherentes entre sí: los totales deben cuadrar con el desglose.
- ${CLIENT_DOCUMENT_CURRENCY}
- Escribe en un tono profesional dirigido al cliente, en segunda persona ("su sitio", "le proponemos").
- Los datos del cliente que no se conocen van como campos entre corchetes para completar ([Nombre del cliente], [Fecha]); los supuestos de alcance se declaran en "Alcance y entregables".
- Nada de notas internas, revisiones de calidad, "próximos pasos del equipo" ni menciones al proceso o a las subtareas.`;


export type FinalRevision = { draft: string; observations: string; corrections: string[] };

/**
 * Writes the one document the director receives. With a single subtask its result
 * already is that document, so no model call is spent. With a revision, the PM
 * rewrites the reviewed draft applying quality control's corrections.
 */
export async function composeFinalDeliverable(taskId: string, revision?: FinalRevision): Promise<string> {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      title: true,
      objective: true,
      description: true,
      subtasks: { orderBy: { order: "asc" }, select: { order: true, title: true, result: true } },
    },
  });

  const results = budgetedResults(task.subtasks);
  const stitched = results.map((subtask) => `## ${subtask.title}\n\n${subtask.result ?? "Sin resultado"}`).join("\n\n");
  const fallback = revision?.draft ?? stitched;

  if (!revision && task.subtasks.length === 1) return task.subtasks[0]?.result?.trim() || stitched;

  const pm = await db.agent.findUnique({ where: { slug: PM_SLUG }, select: { id: true } });
  if (!pm) return fallback;

  const clientDocument = isClientDocument(`${task.title} ${task.objective} ${task.description}`);
  const source = revision
    ? `## Borrador revisado

${revision.draft}

## Correcciones de Control de calidad (aplícalas todas)

${revision.corrections.map((correction, index) => `${index + 1}. ${correction}`).join("\n")}
${revision.observations ? `\nObservaciones generales: ${revision.observations}` : ""}

## Trabajo original del equipo (por si necesitas datos)

${results.map((subtask) => `### ${subtask.order}. ${subtask.title}\n${truncate(subtask.text, 3000)}`).join("\n\n")}`
    : `## Trabajo del equipo

${results.map((subtask) => `### ${subtask.order}. ${subtask.title}\n${subtask.text}`).join("\n\n")}`;

  await markBusy(pm.id);
  try {
    const result = await completeForAgent({
      agentId: pm.id,
      purpose: "review",
      taskId,
      system: clientDocument
        ? "Eres el Project Manager. Redactas el documento final que la agencia enviará al cliente, a partir del trabajo del equipo. Respondes en español y en Markdown."
        : "Eres el Project Manager. Unes el trabajo del equipo en un único entregable final, listo para que el director lo use. Respondes en español y en Markdown.",
      messages: [
        {
          role: "user",
          content: `Tarea: ${task.title}
Objetivo: ${task.objective}
${task.description ? `Contexto: ${task.description}\n` : ""}
${source}

## Instrucciones
${revision ? "Reescribe el documento COMPLETO aplicando cada corrección; conserva lo que ya estaba bien. Devuelve solo el documento final.\n" : ""}${clientDocument ? CLIENT_DOCUMENT_INSTRUCTIONS : DIRECTOR_INSTRUCTIONS}`,
        },
      ],
      maxOutputTokens: clientDocument ? 6000 : 4000,
      temperature: 0.3,
    });

    const { text } = cleanReply(result.text);
    return text.length > 200 ? text : fallback;
  } catch (error) {
    if (error instanceof AIProviderError && ["CANCELLED", "OFFICE_PAUSED", "TASK_PAUSED"].includes(error.code)) {
      throw error;
    }
    console.error("[finalizer] no se pudo consolidar el entregable", error);
    return fallback;
  } finally {
    await markFree(pm.id);
  }
}
