import { Queue, type Job } from "bullmq";
import { redisConnectionOptions } from "./connection";
import { TASK_JOB_NAME, TASK_QUEUE, taskJobId, type TaskJobData } from "./constants";

let taskQueue: Queue<TaskJobData> | null = null;

export function getTaskQueue(): Queue<TaskJobData> {
  if (!taskQueue) {
    taskQueue = new Queue<TaskJobData>(TASK_QUEUE, {
      connection: redisConnectionOptions("queue"),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86_400, count: 200 },
        removeOnFail: { age: 604_800, count: 500 },
      },
    });
  }

  return taskQueue;
}

async function removeIfPending(jobId: string): Promise<void> {
  const queue = getTaskQueue();
  const job = await queue.getJob(jobId);
  if (!job) return;

  const state = await job.getState();
  if (state === "active") return;

  await job.remove().catch(() => undefined);
}

export async function enqueueTaskJob(taskId: string, runAt: Date | null): Promise<Job<TaskJobData>> {
  const queue = getTaskQueue();
  const jobId = taskJobId(taskId);

  await removeIfPending(jobId);

  const delay = runAt ? Math.max(0, runAt.getTime() - Date.now()) : 0;

  return queue.add(TASK_JOB_NAME, { taskId }, { jobId, delay });
}

export async function removeTaskJob(taskId: string): Promise<void> {
  const queue = getTaskQueue();
  const jobId = taskJobId(taskId);
  await removeIfPending(jobId);
  await queue.remove(jobId).catch(() => undefined);
}

export async function pauseTaskQueue(): Promise<void> {
  await getTaskQueue().pause();
}

export async function resumeTaskQueue(): Promise<void> {
  await getTaskQueue().resume();
}

export async function queueHealth(): Promise<{ ok: boolean; counts?: Record<string, number>; error?: string }> {
  try {
    const counts = await getTaskQueue().getJobCounts("waiting", "active", "delayed", "failed", "completed");
    return { ok: true, counts: counts as Record<string, number> };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

export async function closeTaskQueue(): Promise<void> {
  if (taskQueue) {
    await taskQueue.close();
    taskQueue = null;
  }
}
