import { completeForAgent } from "../ai/manager";
import { AIProviderError } from "../ai/types";
import { cleanReply } from "../lib/chat-format";
import { db } from "../lib/db";
import { budgetedResults, markBusy, markFree, PM_SLUG } from "./quality";
import type { ReviewOutcome } from "./reviewer";

const CRITERIA_LABELS: Record<string, string> = {
  objective: "Objetivo",
  accuracy: "Exactitud",
  usefulness: "Utilidad",
  clarity: "Claridad",
};

export function qualityHeader(review: Pick<ReviewOutcome, "score" | "criteria" | "observations" | "reviewerName">): string {
  const criteria = Object.entries(review.criteria)
    .map(([key, value]) => `${CRITERIA_LABELS[key] ?? key} ${value}/10`)
    .join(" · ");
  return `> **Control de calidad (${review.reviewerName}): ${review.score}/10**${criteria ? ` — ${criteria}` : ""}\n> ${review.observations.replace(/\n+/g, " ") || "Sin observaciones."}`;
}

/**
 * Merges every subtask result into the one document the director receives.
 * Falls back to stitching the results together if the model call fails.
 */
export async function composeFinalDeliverable(taskId: string, review: ReviewOutcome): Promise<string> {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      title: true,
      objective: true,
      subtasks: { orderBy: { order: "asc" }, select: { order: true, title: true, result: true } },
    },
  });

  const results = budgetedResults(task.subtasks);
  const header = qualityHeader(review);
  const stitched = results.map((subtask) => `## ${subtask.title}\n\n${subtask.result ?? "Sin resultado"}`).join("\n\n");

  const pm = await db.agent.findUnique({ where: { slug: PM_SLUG }, select: { id: true } });
  if (!pm) return `${header}\n\n${stitched}`;

  await markBusy(pm.id);
  try {
    const result = await completeForAgent({
      agentId: pm.id,
      purpose: "review",
      taskId,
      system:
        "Eres el Project Manager. Unes el trabajo del equipo en un único entregable final, listo para que el director lo use. Respondes en español y en Markdown.",
      messages: [
        {
          role: "user",
          content: `Tarea: ${task.title}
Objetivo: ${task.objective}

Observaciones de Control de calidad: ${review.observations || "ninguna"}

## Trabajo del equipo

${results.map((subtask) => `### ${subtask.order}. ${subtask.title}\n${subtask.text}`).join("\n\n")}

## Instrucciones
Escribe UN único entregable final con esta estructura:
1. **Resumen ejecutivo** (3 a 5 líneas).
2. **Entregable**: el contenido completo y utilizable, integrando las partes sin repetirlas ni resumirlas en exceso. Aplica las observaciones de calidad.
3. **Próximos pasos** (máximo 5 viñetas accionables).
4. **Limitaciones**, solo si las hay (datos que faltan o supuestos).
No inventes datos que no estén en el trabajo del equipo. No menciones subtareas ni el proceso interno.`,
        },
      ],
      maxOutputTokens: 4000,
      temperature: 0.3,
    });

    const { text } = cleanReply(result.text);
    return `${header}\n\n${text.length > 200 ? text : stitched}`;
  } catch (error) {
    if (error instanceof AIProviderError && ["CANCELLED", "OFFICE_PAUSED", "TASK_PAUSED"].includes(error.code)) {
      throw error;
    }
    console.error("[finalizer] no se pudo consolidar el entregable", error);
    return `${header}\n\n${stitched}`;
  } finally {
    await markFree(pm.id);
  }
}
