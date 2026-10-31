import "dotenv/config";
import { DelayedError, Worker, type Job } from "bullmq";
import { AIProviderError } from "../ai/types";
import { runTask } from "../engine/orchestrator";
import { db } from "../lib/db";
import { getEnv } from "../lib/env";
import { AppError } from "../lib/errors";
import { redisConnectionOptions } from "../queue/connection";
import { TASK_QUEUE, taskJobId, type TaskJobData } from "../queue/constants";
import { getOfficeSettings } from "../lib/services/organization";
import { closeRealtimePublisher } from "../realtime/publish";

const PAUSE_RETRY_MS = 60_000;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function setJobStatus(taskId: string, status: "PENDING" | "ACTIVE" | "COMPLETED" | "FAILED" | "CANCELLED", error?: string) {
  await db.scheduledJob.updateMany({
    where: { taskId, jobId: taskJobId(taskId) },
    data: { status, ...(error ? { lastError: error.slice(0, 4000) } : {}) },
  }).catch(() => undefined);
}

async function postpone(job: Job<TaskJobData>, token: string | undefined, reason: string): Promise<never> {
  await setJobStatus(job.data.taskId, "PENDING", reason);
  await job.moveToDelayed(Date.now() + PAUSE_RETRY_MS, token);
  throw new DelayedError();
}

async function processor(job: Job<TaskJobData>, token?: string): Promise<void> {
  const { taskId } = job.data;

  const settings = await getOfficeSettings();
  if (settings.officePaused) {
    await postpone(job, token, "Oficina pausada por el administrador");
  }

  const task = await db.task.findUnique({ where: { id: taskId }, select: { status: true } });
  if (!task || task.status === "CANCELLED" || task.status === "COMPLETED") {
    await setJobStatus(taskId, "CANCELLED");
    return;
  }

  await db.scheduledJob.updateMany({
    where: { taskId, jobId: taskJobId(taskId) },
    data: { status: "ACTIVE", attempts: { increment: 1 }, lastError: null },
  });

  console.log(`[worker] task ${taskId} started`);

  try {
    await runTask(taskId);

    const final = await db.task.findUnique({ where: { id: taskId }, select: { status: true } });
    await setJobStatus(taskId, final?.status === "FAILED" ? "FAILED" : "COMPLETED");
    console.log(`[worker] task ${taskId} finished with status ${final?.status ?? "unknown"}`);
  } catch (error) {
    const taskPaused =
      (error instanceof AIProviderError && error.code === "TASK_PAUSED") ||
      (error instanceof AppError && error.code === "TASK_PAUSED");

    if (taskPaused) {
      // Resumed while this job was still winding down: the resume's enqueue was ignored
      // because this job id was active, so this job has to pick the task back up.
      const latest = await db.task.findUnique({ where: { id: taskId }, select: { status: true, pausedAt: true } });
      if (latest && !latest.pausedAt && latest.status !== "CANCELLED" && latest.status !== "COMPLETED") {
        await setJobStatus(taskId, "PENDING", "Tarea reanudada");
        await job.moveToDelayed(Date.now() + 1_000, token);
        throw new DelayedError();
      }

      await setJobStatus(taskId, "PENDING", "Tarea pausada por el administrador");
      console.log(`[worker] task ${taskId} paused`);
      return;
    }

    if (error instanceof AIProviderError && error.code === "OFFICE_PAUSED") {
      await postpone(job, token, "Oficina pausada durante la ejecución");
    }

    const current = await db.task.findUnique({ where: { id: taskId }, select: { status: true } });
    if (current?.status === "CANCELLED") {
      await setJobStatus(taskId, "CANCELLED");
      return;
    }

    const message = describe(error);
    await setJobStatus(taskId, "FAILED", message);
    console.error(`[worker] task ${taskId} failed: ${message}`);
    throw error;
  }
}

async function heartbeat(status: "running" | "stopped"): Promise<void> {
  await db.setting
    .upsert({
      where: { key: "worker.heartbeat" },
      create: {
        key: "worker.heartbeat",
        value: {
          status,
          at: new Date().toISOString(),
          pid: process.pid,
          concurrency: getEnv().WORKER_CONCURRENCY,
        },
      },
      update: {
        value: {
          status,
          at: new Date().toISOString(),
          pid: process.pid,
          concurrency: getEnv().WORKER_CONCURRENCY,
        },
      },
    })
    .catch((error) => console.error("[worker] heartbeat failed", error));
}

async function main(): Promise<void> {
  const env = getEnv();

  await db.$queryRaw`SELECT 1`;
  const worker = new Worker<TaskJobData>(TASK_QUEUE, processor, {
    connection: redisConnectionOptions("worker"),
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 180_000,
    stalledInterval: 60_000,
    maxStalledCount: 1,
  });

  worker.on("ready", () => console.log(`[worker] ready on ${TASK_QUEUE}`));
  worker.on("error", (error) => console.error("[worker] error", describe(error)));
  worker.on("failed", (job, error) => {
    console.error(`[worker] job ${job?.id ?? "unknown"} failed: ${describe(error)}`);
  });

  await worker.waitUntilReady();
  await heartbeat("running");

  const timer = setInterval(() => {
    void heartbeat("running");
  }, 15_000);
  timer.unref();

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} received, shutting down`);

    clearInterval(timer);
    await heartbeat("stopped").catch(() => undefined);

    const force = setTimeout(() => process.exit(1), 30_000);
    force.unref();

    await worker.close().catch((error) => console.error("[worker] close failed", describe(error)));
    await closeRealtimePublisher().catch(() => undefined);
    await db.$disconnect().catch(() => undefined);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log(
    `[worker] AI Virtual Office worker started (concurrency=${env.WORKER_CONCURRENCY}, subtaskConcurrency=${env.SUBTASK_CONCURRENCY})`,
  );
}

main().catch(async (error) => {
  console.error("[worker] fatal", describe(error));
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
