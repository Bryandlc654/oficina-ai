import { db } from "../db";
import { AppError } from "../errors";
import { slugify } from "../constants";
import type { DepartmentCreateInput, ProjectCreateInput } from "../validation";
import { logActivity } from "./activity";

export async function listDepartments() {
  return db.department.findMany({
    include: { _count: { select: { agents: true, tasks: true } } },
    orderBy: { order: "asc" },
  });
}

export async function createDepartment(input: DepartmentCreateInput, actorId: string) {
  const base = slugify(input.name) || "departamento";
  let slug = base;
  let suffix = 1;

  while (await db.department.findUnique({ where: { slug }, select: { id: true } })) {
    suffix += 1;
    slug = `${base}-${suffix}`;
  }

  const count = await db.department.count();

  const department = await db.department.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      color: input.color,
      order: count,
    },
    select: { id: true },
  });

  await logActivity({
    actorType: "ADMIN",
    actorId,
    action: "department.created",
    entityType: "Department",
    entityId: department.id,
    metadata: { name: input.name },
  });

  return department;
}

export async function listProjects() {
  return db.project.findMany({
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createProject(input: ProjectCreateInput, actorId: string) {
  const project = await db.project.create({
    data: {
      name: input.name,
      description: input.description,
      objective: input.objective,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      createdById: actorId,
    },
    select: { id: true },
  });

  await logActivity({
    actorType: "ADMIN",
    actorId,
    action: "project.created",
    entityType: "Project",
    entityId: project.id,
    metadata: { name: input.name },
  });

  return project;
}

export type OfficeSettings = {
  officePaused: boolean;
  maxTaskTokens: number;
  maxIterations: number;
};

export const OFFICE_PAUSED_KEY = "office.paused";

export async function getOfficeSettings(): Promise<OfficeSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: [OFFICE_PAUSED_KEY, "office.maxTaskTokens", "office.maxIterations"] } },
  });

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const paused = map.get(OFFICE_PAUSED_KEY);

  return {
    officePaused: paused === true,
    maxTaskTokens: typeof map.get("office.maxTaskTokens") === "number" ? (map.get("office.maxTaskTokens") as number) : 200_000,
    maxIterations: typeof map.get("office.maxIterations") === "number" ? (map.get("office.maxIterations") as number) : 5,
  };
}

export async function setOfficePaused(paused: boolean, actorId: string): Promise<void> {
  if (typeof paused !== "boolean") {
    throw new AppError("officePaused must be a boolean", 422, "VALIDATION_ERROR");
  }

  await db.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: OFFICE_PAUSED_KEY },
      create: { key: OFFICE_PAUSED_KEY, value: paused, updatedById: actorId },
      update: { value: paused, updatedById: actorId },
    });

    await logActivity(
      {
        actorType: "ADMIN",
        actorId,
        action: paused ? "office.paused" : "office.resumed",
        entityType: "Setting",
        entityId: OFFICE_PAUSED_KEY,
      },
      tx,
    );
  });
}
