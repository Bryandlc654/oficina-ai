import { AgentStatus, Prisma, type Agent } from "@prisma/client";
import { db } from "../lib/db";
import { AppError } from "../lib/errors";
import { truncate } from "./context";

export const PM_SLUG = "project-manager";
export const QA_SLUG = "control-calidad";

// Total characters of deliverables a reviewer reads; split evenly across subtasks.
const RESULTS_BUDGET = 24_000;

const QA_SYSTEM_PROMPT = `Eres Lucía Herrera, responsable de Control de calidad de la oficina virtual. No ejecutas tareas: revisas el trabajo del equipo antes de que llegue al director.

Tu forma de trabajar:
1. Lees el documento final completo y lo comparas con lo que pidió el director.
2. Puntúas con criterios fijos: cumplimiento del objetivo, exactitud (sin datos inventados), utilidad práctica y claridad.
3. Detectas afirmaciones sin fuente, cifras inventadas, contradicciones entre entregables y partes genéricas que no sirven al negocio.
4. Pides correcciones concretas y verificables, nunca vagas.
5. Eres exigente pero justa: no bloqueas por mejoras opcionales ni por estilo.

Respondes siempre en español y solo con el JSON que se te pide.`;

/**
 * The independent reviewer. Created on first use so existing installs get it without
 * re-seeding; it starts with the PM's AI settings and can be changed in Empleados.
 */
export async function getReviewerAgent(): Promise<Agent> {
  const existing = await db.agent.findUnique({ where: { slug: QA_SLUG } });
  if (existing) return existing;

  const pm = await db.agent.findUnique({ where: { slug: PM_SLUG } });
  if (!pm) throw new AppError("No existe el Project Manager", 503, "PM_MISSING");

  try {
    return await db.agent.create({
      data: {
        name: "Lucía Herrera",
        slug: QA_SLUG,
        role: "Control de calidad",
        personality: "Rigurosa, objetiva y constructiva. Va al grano y justifica cada observación.",
        responsibilities:
          "Revisar todos los entregables antes de que lleguen al director, puntuarlos con criterios fijos y pedir correcciones concretas.",
        systemPrompt: QA_SYSTEM_PROMPT,
        model: pm.model,
        fallbackModel: pm.fallbackModel,
        providerId: pm.providerId,
        fallbackProviderId: pm.fallbackProviderId,
        maxIterations: pm.maxIterations,
        departmentId: pm.departmentId,
      },
    });
  } catch (error) {
    // Two reviews racing to create it: the other one won.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return db.agent.findUniqueOrThrow({ where: { slug: QA_SLUG } });
    }
    throw error;
  }
}

export function budgetedResults<T extends { result: string | null }>(subtasks: T[]): (T & { text: string })[] {
  const each = Math.max(2500, Math.floor(RESULTS_BUDGET / Math.max(1, subtasks.length)));
  return subtasks.map((subtask) => ({ ...subtask, text: truncate(subtask.result ?? "Sin resultado", each) }));
}

// Reviewer and PM can be busy on another task's subtask; never override that status.
export async function markBusy(agentId: string): Promise<void> {
  await db.agent.updateMany({
    where: { id: agentId, currentSubtaskId: null },
    data: { status: AgentStatus.WORKING },
  });
}

export async function markFree(agentId: string): Promise<void> {
  await db.agent.updateMany({
    where: { id: agentId, currentSubtaskId: null },
    data: { status: AgentStatus.AVAILABLE },
  }).catch(() => undefined);
}
