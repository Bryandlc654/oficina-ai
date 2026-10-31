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
  /** 0 means no limit. */
  maxTaskTokens: number;
  maxIterations: number;
  /** Minimum quality-control score (0-10) for work to be delivered. */
  qualityMinScore: number;
  /** Deliver approved work without waiting for the director. */
  autoApprove: boolean;
};

export const OFFICE_PAUSED_KEY = "office.paused";

const SETTING_KEYS = {
  maxTaskTokens: "office.maxTaskTokens",
  maxIterations: "office.maxIterations",
  qualityMinScore: "office.qualityMinScore",
  autoApprove: "office.autoApprove",
} as const;

export async function getOfficeSettings(): Promise<OfficeSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: [OFFICE_PAUSED_KEY, ...Object.values(SETTING_KEYS)] } },
  });

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const number = (key: string, fallback: number) => {
    const value = map.get(key);
    return typeof value === "number" ? value : fallback;
  };

  return {
    officePaused: map.get(OFFICE_PAUSED_KEY) === true,
    maxTaskTokens: number(SETTING_KEYS.maxTaskTokens, 0),
    maxIterations: number(SETTING_KEYS.maxIterations, 5),
    qualityMinScore: number(SETTING_KEYS.qualityMinScore, 7),
    autoApprove: map.get(SETTING_KEYS.autoApprove) !== false,
  };
}

export type QualitySettingsInput = Partial<Pick<OfficeSettings, "maxTaskTokens" | "qualityMinScore" | "autoApprove">>;

export async function updateQualitySettings(input: QualitySettingsInput, actorId: string): Promise<void> {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined) as [
    keyof QualitySettingsInput,
    number | boolean,
  ][];
  if (entries.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const [field, value] of entries) {
      const key = SETTING_KEYS[field];
      await tx.setting.upsert({
        where: { key },
        create: { key, value, updatedById: actorId },
        update: { value, updatedById: actorId },
      });
    }

    await logActivity(
      {
        actorType: "ADMIN",
        actorId,
        action: "office.settings_updated",
        entityType: "Setting",
        metadata: Object.fromEntries(entries),
      },
      tx,
    );
  });
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
