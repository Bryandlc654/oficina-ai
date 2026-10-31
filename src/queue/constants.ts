export const TASK_QUEUE = "task-execution";

export type TaskJobData = {
  taskId: string;
};

export const TASK_JOB_NAME = "execute-task";

export function taskJobId(taskId: string): string {
  return `task-${taskId}`;
}
