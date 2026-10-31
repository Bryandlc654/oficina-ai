import { db } from "../lib/db";
import { logActivity } from "../lib/services/activity";
import { publishOfficeEvent } from "../realtime/publish";
import { TASK_QUEUE, taskJobId } from "./constants";
import { enqueueTaskJob, removeTaskJob } from "./queue";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Schedules a task in BullMQ and persists the queue state. A Redis outage must
 * not lose the task: the failure is recorded and can be retried by rescheduling.
 */
export async function scheduleTaskExecution(taskId: string, runAt: Date | null): Promise<boolean> {
  const jobId = taskJobId(taskId);
  const effectiveRunAt = runAt ?? new Date();

  try {
    await enqueueTaskJob(taskId, runAt);

    await db.scheduledJob.upsert({
      where: { jobId },
      create: {
        taskId,
        jobId,
        queue: TASK_QUEUE,
        status: runAt && runAt.getTime() > Date.now() ? "PENDING" : "QUEUED",
        runAt: effectiveRunAt,
      },
      update: {
        status: "QUEUED",
        runAt: effectiveRunAt,
        lastError: null,
        queue: TASK_QUEUE,
      },
    });

    await logActivity({
      actorType: "SYSTEM",
      action: "task.scheduled",
      entityType: "Task",
      entityId: taskId,
      metadata: { runAt: effectiveRunAt.toISOString() },
    });

    void publishOfficeEvent({
      type: "task.scheduled",
      taskId,
      status: runAt && runAt.getTime() > Date.now() ? "SCHEDULED" : "QUEUED",
      message: runAt && runAt.getTime() > Date.now() ? "Tarea programada" : "Tarea en cola de ejecución",
    });

    return true;
  } catch (error) {
    const message = errorMessage(error);

    await db.scheduledJob
      .upsert({
        where: { jobId },
        create: {
          taskId,
          jobId,
          queue: TASK_QUEUE,
          status: "FAILED",
          runAt: effectiveRunAt,
          lastError: message,
        },
        update: { status: "FAILED", lastError: message, runAt: effectiveRunAt },
      })
      .catch(() => undefined);

    await logActivity({
      actorType: "SYSTEM",
      action: "task.schedule.failed",
      entityType: "Task",
      entityId: taskId,
      metadata: { message },
    }).catch(() => undefined);

    console.error(`[scheduler] no se pudo programar la tarea ${taskId}: ${message}`);

    void publishOfficeEvent({
      type: "task.schedule.failed",
      taskId,
      status: "FAILED",
      message: "No se pudo programar la tarea en la cola",
    });

    return false;
  }
}

export async function cancelTaskExecution(taskId: string): Promise<void> {
  try {
    await removeTaskJob(taskId);
  } catch (error) {
    console.error(`[scheduler] no se pudo retirar el job ${taskId}: ${errorMessage(error)}`);
  }

  await db.scheduledJob
    .updateMany({ where: { taskId, status: { in: ["PENDING", "QUEUED", "ACTIVE"] } }, data: { status: "CANCELLED" } })
    .catch(() => undefined);
}

export async function pauseTaskExecution(taskId: string): Promise<void> {
  try {
    await removeTaskJob(taskId);
  } catch (error) {
    console.error(`[scheduler] no se pudo retirar el job pausado ${taskId}: ${errorMessage(error)}`);
  }

  await db.scheduledJob
    .updateMany({
      where: { taskId, status: { in: ["PENDING", "QUEUED", "ACTIVE"] } },
      data: { status: "PENDING", lastError: "Tarea pausada por el administrador" },
    })
    .catch(() => undefined);

  await logActivity({
    actorType: "SYSTEM",
    action: "task.execution.paused",
    entityType: "Task",
    entityId: taskId,
  }).catch(() => undefined);
}
