import { AgentStatus, TaskStatus } from "@prisma/client";
import { AIProviderError } from "../ai/types";
import { getEnv } from "../lib/env";
import { db } from "../lib/db";
import { AppError } from "../lib/errors";
import { logActivity } from "../lib/services/activity";
import { getOfficeSettings } from "../lib/services/organization";
import { publishOfficeEvent } from "../realtime/publish";
import { loadTaskSubtasks } from "./context";
import { executeSubtask } from "./executor";
import { composeFinalDeliverable } from "./finalizer";
import { createPlan } from "./planner";
import { reviewTask } from "./reviewer";
import { PM_SLUG } from "./quality";

const MAX_CYCLES = 24;
const MAX_SUBTASK_ATTEMPTS = 2;
const MAX_REVIEW_ROUNDS = 2;
const TERMINAL_CODES = new Set(["BUDGET_EXCEEDED", "QUOTA", "AUTH", "NOT_CONFIGURED"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function assertRunnable(taskId: string): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { status: true, pausedAt: true },
  });

  if (!task) throw new AppError("La tarea no existe", 404, "NOT_FOUND");
  if (task.status === TaskStatus.CANCELLED) throw new AppError("La tarea fue cancelada", 409, "CANCELLED");
  if (task.pausedAt) throw new AppError("La tarea está pausada por el administrador", 409, "TASK_PAUSED");
}

async function recomputeTokenUsage(taskId: string): Promise<void> {
  const usage = await db.aIUsage.aggregate({
    where: { taskId },
    _sum: { totalTokens: true },
  });

  await db.task.update({
    where: { id: taskId },
    data: { tokensUsed: usage._sum.totalTokens ?? 0 },
  });
}

async function resetStaleState(taskId: string): Promise<void> {
  const subtasks = await db.subtask.findMany({
    where: { taskId },
    select: { id: true, assignedAgentId: true },
  });

  const agentIds = subtasks
    .map((subtask) => subtask.assignedAgentId)
    .filter((id): id is string => Boolean(id));

  await db.$transaction([
    db.subtask.updateMany({
      where: { taskId, status: { in: ["RUNNING", "FAILED", "REVIEW"] } },
      data: { status: "ASSIGNED", errorMessage: null, iterations: 0 },
    }),
    db.subtask.updateMany({
      where: { taskId, status: "PENDING" },
      data: { errorMessage: null, iterations: 0 },
    }),
    db.agentRun.updateMany({
      where: { taskId, status: "RUNNING" },
      data: {
        status: "FAILED",
        error: "Ejecución interrumpida antes de reanudar la tarea",
        finishedAt: new Date(),
      },
    }),
    db.agent.updateMany({
      where: notBusyElsewhere(taskId, agentIds),
      data: { status: AgentStatus.AVAILABLE, currentSubtaskId: null },
    }),
    db.task.update({
      where: { id: taskId },
      data: { errorMessage: null },
    }),
  ]);
}

async function resetAgents(taskId: string): Promise<void> {
  const subtasks = await db.subtask.findMany({
    where: { taskId },
    select: { assignedAgentId: true },
  });

  const agentIds = subtasks
    .map((subtask) => subtask.assignedAgentId)
    .filter((id): id is string => Boolean(id));

  if (agentIds.length === 0) return;

  await db.agent.updateMany({
    where: notBusyElsewhere(taskId, agentIds),
    data: { status: AgentStatus.AVAILABLE, currentSubtaskId: null },
  });
}

// An agent can be on several tasks; only free the ones not working on another task right now.
function notBusyElsewhere(taskId: string, agentIds: string[]) {
  return {
    id: { in: agentIds },
    OR: [{ currentSubtaskId: null }, { currentSubtask: { is: { taskId } } }],
  };
}

async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  let firstError: unknown = null;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;

      try {
        await fn(item);
      } catch (error) {
        if (firstError === null) firstError = error;
      }
    }
  });

  await Promise.all(workers);
  if (firstError !== null) throw firstError;
}

async function executeWithRetries(subtaskId: string): Promise<void> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_SUBTASK_ATTEMPTS; attempt += 1) {
    try {
      await executeSubtask(subtaskId);
      return;
    } catch (error) {
      lastError = error;

      if (error instanceof AIProviderError) {
        if (TERMINAL_CODES.has(error.code) || error.code === "CANCELLED" || error.code === "OFFICE_PAUSED") {
          break;
        }
      }

      if (attempt < MAX_SUBTASK_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }

  const message = errorMessage(lastError);

  await db.subtask.update({
    where: { id: subtaskId },
    data: { status: "FAILED", errorMessage: message.slice(0, 2000) },
  }).catch(() => undefined);

  throw lastError instanceof Error ? lastError : new AppError(message, 500, "SUBTASK_FAILED");
}

async function executeAllSubtasks(taskId: string): Promise<void> {
  const concurrency = getEnv().SUBTASK_CONCURRENCY;

  for (let cycle = 0; cycle < MAX_CYCLES; cycle += 1) {
    await assertRunnable(taskId);

    const subtasks = await loadTaskSubtasks(taskId);

    if (subtasks.length === 0) {
      throw new AppError("La tarea no tiene subtareas planificadas", 422, "NO_PLAN");
    }

    if (subtasks.every((subtask) => subtask.status === "COMPLETED")) return;

    const failed = subtasks.filter((subtask) => subtask.status === "FAILED");
    if (failed.length > 0) {
      throw new AppError(
        `Subtarea fallida: ${failed[0]?.title}. ${failed[0]?.errorMessage ?? ""}`,
        422,
        "SUBTASK_FAILED",
      );
    }

    const completedIds = new Set(
      subtasks.filter((subtask) => subtask.status === "COMPLETED").map((subtask) => subtask.id),
    );

    const ready = subtasks.filter((subtask) => {
      if (subtask.status !== "PENDING" && subtask.status !== "ASSIGNED") return false;
      return subtask.dependencies.every((dependency) => completedIds.has(dependency.dependsOnId));
    });

    if (ready.length === 0) {
      throw new AppError("El plan de trabajo está bloqueado: no hay subtareas ejecutables", 422, "PLAN_BLOCKED");
    }

    await runWithConcurrency(ready, concurrency, async (subtask) => {
      await executeWithRetries(subtask.id);
    });
  }

  throw new AppError("Se excedió el límite de ciclos de ejecución", 500, "CYCLE_LIMIT");
}

async function recordFinalReport(taskId: string, title: string, content: string): Promise<void> {
  const pm = await db.agent.findUnique({ where: { slug: PM_SLUG }, select: { id: true } });
  if (!pm) return;

  await db.deliverable.create({
    data: {
      taskId,
      agentId: pm.id,
      title: title.slice(0, 180),
      type: "REPORT",
      content,
    },
  });
}

async function finalizeApproved(taskId: string, finalReport: string): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { status: true, title: true } });
  if (!task) return;
  if (task.status === TaskStatus.CANCELLED) return;

  const pm = await db.agent.findUnique({ where: { slug: PM_SLUG }, select: { id: true } });

  await db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETED,
        finalReport,
        completedAt: new Date(),
        approvalStatus: "APPROVED",
        errorMessage: null,
      },
    });

    if (pm) {
      await tx.deliverable.create({
        data: {
          taskId,
          agentId: pm.id,
          title: `Entregable final — ${task.title}`.slice(0, 180),
          type: "REPORT",
          content: finalReport,
        },
      });
    }

    await logActivity(
      {
        actorType: "AGENT",
        actorId: pm?.id ?? null,
        action: "task.completed",
        entityType: "Task",
        entityId: taskId,
        metadata: { finalReportChars: finalReport.length },
      },
      tx,
    );
  }, { maxWait: 10000, timeout: 30000 });

  await resetAgents(taskId);

  void publishOfficeEvent({
    type: "task.status",
    taskId,
    status: "COMPLETED",
    message: `Tarea completada: ${task.title}`,
  });
}

async function holdForApproval(
  taskId: string,
  review: { observations: string; finalReport: string },
): Promise<void> {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { title: true } });
  if (!task) return;

  await db.$transaction([
    db.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.REVIEW,
        finalReport: review.finalReport,
        approvalStatus: "PENDING",
        errorMessage: null,
        completedAt: null,
      },
    }),
    db.subtask.updateMany({
      where: { taskId, status: { in: ["PENDING", "ASSIGNED", "RUNNING"] } },
      data: {
        status: "REVIEW",
        errorMessage: "Corrección pendiente de decisión del director",
      },
    }),
  ]);

  await logActivity({
    actorType: "SYSTEM",
    action: "task.pending_approval",
    entityType: "Task",
    entityId: taskId,
    metadata: { observations: review.observations.slice(0, 1000) },
  });

  await resetAgents(taskId);

  void publishOfficeEvent({
    type: "task.status",
    taskId,
    status: "REVIEW",
    message: `Tarea pendiente de aprobación del director: ${task.title}`,
  });
}

async function failTask(taskId: string, message: string, finalReport?: string): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { status: true, title: true },
  });

  if (!task) return;
  if (task.status === TaskStatus.CANCELLED || task.status === TaskStatus.COMPLETED) return;

  if (finalReport && finalReport.trim().length > 0) {
    await recordFinalReport(taskId, `Informe de revisión — ${task.title}`, finalReport).catch(() => undefined);
  }

  await db.task.update({
    where: { id: taskId },
    data: {
      status: TaskStatus.FAILED,
      errorMessage: message.slice(0, 4000),
      finalReport: finalReport ?? null,
      approvalStatus: "REJECTED",
    },
  });

  await logActivity({
    actorType: "SYSTEM",
    action: "task.failed",
    entityType: "Task",
    entityId: taskId,
    metadata: { message: message.slice(0, 1000) },
  });

  await resetAgents(taskId);

  void publishOfficeEvent({
    type: "task.status",
    taskId,
    status: "FAILED",
    message: `Tarea con error: ${task.title}`,
  });
}

export async function runTask(taskId: string): Promise<void> {
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { id: true, status: true, title: true, subtasks: { select: { id: true } } },
  });

  if (!task) throw new AppError("La tarea no existe", 404, "NOT_FOUND");
  if (task.status === TaskStatus.CANCELLED || task.status === TaskStatus.COMPLETED) return;

  await recomputeTokenUsage(taskId);
  await resetStaleState(taskId);
  await assertRunnable(taskId);

  try {
    if (task.status === TaskStatus.SCHEDULED) {
      await db.task.update({ where: { id: taskId }, data: { status: TaskStatus.PENDING } });
    }

    if (task.subtasks.length === 0) {
      await createPlan(taskId);
    }

    await db.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.RUNNING, startedAt: new Date() },
    });

    await executeAllSubtasks(taskId);

    await assertRunnable(taskId);

    await db.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.REVIEW },
    });

    const { qualityMinScore, autoApprove } = await getOfficeSettings();

    for (let round = 1; round <= MAX_REVIEW_ROUNDS; round += 1) {
      await assertRunnable(taskId);

      let review;
      try {
        review = await reviewTask(taskId, round, qualityMinScore);
      } catch (error) {
        if (error instanceof AIProviderError) {
          if (["CANCELLED", "OFFICE_PAUSED", "TASK_PAUSED"].includes(error.code)) throw error;
        }
        if (error instanceof AppError) {
          if (["CANCELLED", "OFFICE_PAUSED", "TASK_PAUSED"].includes(error.code)) throw error;
        }

        const message = errorMessage(error);
        await holdForApproval(taskId, {
          observations: "La revisión automática no pudo completarse. Los entregables quedan pendientes de decisión del director.",
          finalReport: `## Revisión pendiente del director\n\nLos entregables de la tarea están completos, pero Control de calidad no pudo completar la revisión automática.\n\nMotivo: ${message}\n\nRevisa los entregables y usa "Aprobar y completar" o solicita cambios.`,
        });
        return;
      }

      // A second round only happens when the score fell short and there is something to fix.
      const lastChance = round === MAX_REVIEW_ROUNDS || review.corrections.length === 0;
      if (review.passed || lastChance) {
        await assertRunnable(taskId);
        const finalReport = await composeFinalDeliverable(taskId, review);
        if (review.passed && autoApprove) {
          await finalizeApproved(taskId, finalReport);
        } else {
          await holdForApproval(taskId, { observations: review.observations, finalReport });
        }
        return;
      }

      await db.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.RUNNING },
      });

      await executeAllSubtasks(taskId);

      await db.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.REVIEW },
      });
    }
  } catch (error) {
    if (error instanceof AIProviderError) {
      if (
        error.code === "CANCELLED" ||
        error.code === "OFFICE_PAUSED" ||
        error.code === "TASK_PAUSED"
      ) {
        throw error;
      }
    }

    if (error instanceof AppError) {
      if (
        error.code === "CANCELLED" ||
        error.code === "OFFICE_PAUSED" ||
        error.code === "TASK_PAUSED"
      ) {
        throw error;
      }
    }

    const message = errorMessage(error);
    await failTask(taskId, message).catch(() => undefined);
    throw error;
  }
}
