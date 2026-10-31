import { TaskStatus } from "@prisma/client";
import { AppError } from "../errors";

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  SCHEDULED: [TaskStatus.PENDING, TaskStatus.CANCELLED],
  PENDING: [TaskStatus.SCHEDULED, TaskStatus.PLANNING, TaskStatus.CANCELLED],
  PLANNING: [TaskStatus.RUNNING, TaskStatus.FAILED, TaskStatus.CANCELLED],
  RUNNING: [TaskStatus.REVIEW, TaskStatus.FAILED, TaskStatus.CANCELLED],
  REVIEW: [TaskStatus.COMPLETED, TaskStatus.RUNNING, TaskStatus.FAILED, TaskStatus.CANCELLED],
  COMPLETED: [],
  FAILED: [TaskStatus.PENDING, TaskStatus.CANCELLED],
  CANCELLED: [TaskStatus.PENDING],
};

/** Only the engine may move a task between execution states; the admin can cancel or reopen. */
export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (from === to) return;

  if (!TRANSITIONS[from].includes(to)) {
    throw new AppError(`Transición de estado no permitida: ${from} → ${to}`, 409, "INVALID_STATUS_TRANSITION");
  }
}
