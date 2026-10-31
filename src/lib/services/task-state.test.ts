import { describe, expect, it } from "vitest";
import { TaskStatus } from "@prisma/client";
import { assertTaskTransition } from "./task-state";

describe("assertTaskTransition", () => {
  it("allows the admin to cancel a pending task", () => {
    expect(() => assertTaskTransition(TaskStatus.PENDING, TaskStatus.CANCELLED)).not.toThrow();
  });

  it("allows reopening a cancelled task", () => {
    expect(() => assertTaskTransition(TaskStatus.CANCELLED, TaskStatus.PENDING)).not.toThrow();
  });

  it("allows retrying a failed task", () => {
    expect(() => assertTaskTransition(TaskStatus.FAILED, TaskStatus.PENDING)).not.toThrow();
  });

  it("does not allow reopening a completed task", () => {
    expect(() => assertTaskTransition(TaskStatus.COMPLETED, TaskStatus.PENDING)).toThrow();
  });

  it("does not allow skipping from pending directly to completed", () => {
    expect(() => assertTaskTransition(TaskStatus.PENDING, TaskStatus.COMPLETED)).toThrow();
  });

  it("allows the engine to advance into planning and running", () => {
    expect(() => assertTaskTransition(TaskStatus.PENDING, TaskStatus.PLANNING)).not.toThrow();
  });

  it("treats an identical transition as a no-op", () => {
    expect(() => assertTaskTransition(TaskStatus.RUNNING, TaskStatus.RUNNING)).not.toThrow();
  });
});
