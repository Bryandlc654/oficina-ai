import { Prisma, TaskStatus } from "@prisma/client";
import { db } from "../db";
import { AppError, ConflictError, NotFoundError } from "../errors";
import type { TaskCreateInput, TaskUpdateInput } from "../validation";
import { logActivity } from "./activity";
import { assertTaskTransition } from "./task-state";
import { cancelTaskExecution, pauseTaskExecution, scheduleTaskExecution } from "../../queue/scheduler";
import { publishOfficeEvent } from "../../realtime/publish";

const taskDetailInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  department: true,
  project: { select: { id: true, name: true } },
  assignments: { include: { agent: { select: { id: true, name: true, role: true } } } },
  subtasks: {
    orderBy: { order: "asc" as const },
    include: {
      assignedAgent: { select: { id: true, name: true, role: true } },
      dependencies: { include: { dependsOn: { select: { id: true, title: true, order: true } } } },
      dependents: { include: { subtask: { select: { id: true, title: true, order: true } } } },
      deliverables: true,
    },
  },
  deliverables: { orderBy: { createdAt: "desc" as const }, include: { agent: { select: { id: true, name: true } } } },
  runs: {
    orderBy: { createdAt: "desc" as const },
    take: 30,
    include: { agent: { select: { id: true, name: true } } },
  },
  scheduledJobs: { orderBy: { runAt: "desc" as const }, take: 5 },
} satisfies Prisma.TaskInclude;

export async function listTasks() {
  return db.task.findMany({
    include: {
      department: { select: { id: true, name: true, color: true } },
      project: { select: { id: true, name: true } },
      assignments: { include: { agent: { select: { id: true, name: true, avatarUrl: true } } } },
      _count: { select: { subtasks: true, deliverables: true } },
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
  });
}

export async function getTaskDetail(id: string) {
  const task = await db.task.findUnique({ where: { id }, include: taskDetailInclude });
  if (!task) throw new NotFoundError("Tarea");
  return task;
}

export async function createTask(input: TaskCreateInput, actorId: string) {
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
  const isFuture = scheduledFor !== null && scheduledFor.getTime() > Date.now() + 60_000;
  const agentIds = [...new Set(input.agentIds)];

  const created = await db.$transaction(async (tx) => {
    const duplicate = await tx.task.findFirst({
      where: {
        title: input.title,
        objective: input.objective,
        status: { notIn: [TaskStatus.CANCELLED, TaskStatus.COMPLETED] },
        createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictError("Ya existe una tarea activa idéntica creada hace menos de 5 minutos.");
    }

    if (agentIds.length > 0) {
      const agents = await tx.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true } });
      if (agents.length !== agentIds.length) {
        throw new AppError("Uno o más empleados asignados no existen", 422, "INVALID_AGENTS");
      }
    }

    if (input.projectId) {
      const project = await tx.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
      if (!project) throw new NotFoundError("Proyecto");
    }

    if (input.departmentId) {
      const department = await tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true } });
      if (!department) throw new NotFoundError("Departamento");
    }

    const task = await tx.task.create({
      data: {
        title: input.title,
        objective: input.objective,
        description: input.description,
        priority: input.priority,
        scheduledFor,
        status: isFuture ? TaskStatus.SCHEDULED : TaskStatus.PENDING,
        createdById: actorId,
        departmentId: input.departmentId ?? null,
        projectId: input.projectId ?? null,
        assignments: {
          create: agentIds.map((agentId, index) => ({
            agentId,
            role: index === 0 ? ("OWNER" as const) : ("CONTRIBUTOR" as const),
          })),
        },
      },
      select: { id: true },
    });

    await logActivity(
      {
        actorType: "ADMIN",
        actorId,
        action: "task.created",
        entityType: "Task",
        entityId: task.id,
        metadata: { title: input.title, priority: input.priority, scheduledFor: scheduledFor?.toISOString() ?? null },
      },
      tx,
    );

    return task;
  }, { maxWait: 10000, timeout: 30000 });

  await scheduleTaskExecution(created.id, scheduledFor);

  void publishOfficeEvent({
    type: "task.created",
    taskId: created.id,
    status: isFuture ? "SCHEDULED" : "PENDING",
    message: `Nueva tarea: ${input.title}`,
  });

  return created;
}

export async function updateTask(id: string, input: TaskUpdateInput, actorId: string) {
  const task = await db.task.findUnique({ where: { id } });
  if (!task) throw new NotFoundError("Tarea");

  if (input.status) {
    assertTaskTransition(task.status, input.status);
  }

  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.objective !== undefined) data.objective = input.objective;
  if (input.description !== undefined) data.description = input.description;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.scheduledFor !== undefined) {
    data.scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null;
    if (task.status === TaskStatus.SCHEDULED || task.status === TaskStatus.PENDING) {
      data.status = input.scheduledFor ? TaskStatus.SCHEDULED : TaskStatus.PENDING;
    }
  }
  if (input.projectId !== undefined) {
    data.project = input.projectId ? { connect: { id: input.projectId } } : { disconnect: true };
  }
  if (input.departmentId !== undefined) {
    data.department = input.departmentId ? { connect: { id: input.departmentId } } : { disconnect: true };
  }
  if (input.status !== undefined) {
    data.status = input.status;
    if (input.status === TaskStatus.CANCELLED) data.completedAt = new Date();
    if (input.status === TaskStatus.COMPLETED) {
      data.completedAt = new Date();
      data.approvalStatus = "APPROVED";
    }
  }
  if (input.paused !== undefined) {
    data.pausedAt = input.paused ? new Date() : null;
  }

  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data });
    await logActivity(
      {
        actorType: "ADMIN",
        actorId,
        action: input.status ? "task.status.changed" : "task.updated",
        entityType: "Task",
        entityId: id,
        metadata: { fields: Object.keys(input), status: input.status ?? null },
      },
      tx,
    );
  }, { maxWait: 10000, timeout: 30000 });

  const saved = await db.task.findUnique({
    where: { id },
    select: { status: true, scheduledFor: true, pausedAt: true },
  });

  if (saved) {
    const resumable =
      saved.status === TaskStatus.PENDING ||
      saved.status === TaskStatus.SCHEDULED ||
      saved.status === TaskStatus.PLANNING ||
      saved.status === TaskStatus.RUNNING ||
      saved.status === TaskStatus.REVIEW;

    if (saved.status === TaskStatus.CANCELLED) {
      await cancelTaskExecution(id);
    } else if (input.paused === true) {
      await pauseTaskExecution(id);
    } else if (input.paused === false) {
      if (resumable) await scheduleTaskExecution(id, saved.scheduledFor);
    } else if (
      (input.scheduledFor !== undefined || input.status === TaskStatus.PENDING) &&
      !saved.pausedAt &&
      (saved.status === TaskStatus.PENDING || saved.status === TaskStatus.SCHEDULED)
    ) {
      await scheduleTaskExecution(id, saved.scheduledFor);
    }

    void publishOfficeEvent({
      type: "task.updated",
      taskId: id,
      status: saved.status,
      message: input.paused === true ? "Tarea pausada" : input.paused === false ? "Tarea reanudada" : "Tarea actualizada",
    });
  }

  return getTaskDetail(id);
}

export async function cancelTask(id: string, actorId: string) {
  return updateTask(id, { status: TaskStatus.CANCELLED }, actorId);
}
