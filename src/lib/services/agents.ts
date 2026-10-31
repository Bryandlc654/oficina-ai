import { AgentStatus, Prisma } from "@prisma/client";
import { db } from "../db";
import { NotFoundError } from "../errors";
import type { AgentUpdateInput } from "../validation";
import { logActivity } from "./activity";

export async function listAgents() {
  return db.agent.findMany({
    include: {
      department: true,
      tools: { orderBy: { name: "asc" } },
      _count: { select: { runs: true, deliverables: true } },
    },
    orderBy: [{ department: { order: "asc" } }, { name: "asc" }],
  });
}

export async function getAgentDetail(id: string) {
  const agent = await db.agent.findUnique({
    where: { id },
    include: {
      department: true,
      provider: { select: { id: true, name: true, type: true, isEnabled: true, models: true } },
      fallbackProvider: { select: { id: true, name: true, type: true, isEnabled: true, models: true } },
      currentSubtask: { select: { id: true, title: true, status: true, task: { select: { id: true, title: true } } } },
      tools: { orderBy: { name: "asc" } },
      memories: { orderBy: { updatedAt: "desc" }, take: 20 },
      runs: {
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { task: { select: { id: true, title: true } }, subtask: { select: { id: true, title: true } } },
      },
      deliverables: { orderBy: { createdAt: "desc" }, take: 10, include: { task: { select: { id: true, title: true } } } },
      _count: { select: { runs: true, deliverables: true, memories: true } },
    },
  });

  if (!agent) throw new NotFoundError("Agente");
  return agent;
}

export async function listAssignableAgents() {
  return db.agent.findMany({
    where: { status: { not: AgentStatus.OFFLINE } },
    select: { id: true, name: true, role: true, status: true, department: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
}

export async function updateAgent(id: string, input: AgentUpdateInput, actorId: string) {
  const existing = await db.agent.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Agente");

  if (input.departmentId) {
    const department = await db.department.findUnique({ where: { id: input.departmentId } });
    if (!department) throw new NotFoundError("Departamento");
  }

  if (input.providerId) {
    const provider = await db.aIProvider.findUnique({ where: { id: input.providerId } });
    if (!provider) throw new NotFoundError("Proveedor de IA");
  }

  if (input.fallbackProviderId) {
    const provider = await db.aIProvider.findUnique({ where: { id: input.fallbackProviderId } });
    if (!provider) throw new NotFoundError("Proveedor de IA alternativo");
  }

  const data: Prisma.AgentUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.personality !== undefined) data.personality = input.personality;
  if (input.responsibilities !== undefined) data.responsibilities = input.responsibilities;
  if (input.systemPrompt !== undefined) data.systemPrompt = input.systemPrompt;
  if (input.model !== undefined) data.model = input.model;
  if (input.fallbackModel !== undefined) data.fallbackModel = input.fallbackModel;
  if (input.maxIterations !== undefined) data.maxIterations = input.maxIterations;
  if (input.dailyTokenLimit !== undefined) data.dailyTokenLimit = input.dailyTokenLimit;
  if (input.status !== undefined) data.status = input.status;
  if (input.departmentId !== undefined) data.department = { connect: { id: input.departmentId } };
  if (input.providerId !== undefined) {
    data.provider = input.providerId ? { connect: { id: input.providerId } } : { disconnect: true };
  }
  if (input.fallbackProviderId !== undefined) {
    data.fallbackProvider = input.fallbackProviderId
      ? { connect: { id: input.fallbackProviderId } }
      : { disconnect: true };
  }

  const systemPromptChanged =
    input.systemPrompt !== undefined && input.systemPrompt !== existing.systemPrompt;

  await db.$transaction(async (tx) => {
    await tx.agent.update({ where: { id }, data });

    if (input.tools) {
      await tx.agentTool.deleteMany({ where: { agentId: id } });
      if (input.tools.length > 0) {
        await tx.agentTool.createMany({
          data: input.tools.map((tool) => ({
            agentId: id,
            name: tool.name,
            description: tool.description,
            isEnabled: tool.isEnabled,
            requiresApproval: tool.requiresApproval,
          })),
        });
      }
    }

    await logActivity(
      {
        actorType: "ADMIN",
        actorId,
        action: systemPromptChanged ? "agent.system_prompt.updated" : "agent.updated",
        entityType: "Agent",
        entityId: id,
        metadata: { fields: Object.keys(input) },
      },
      tx,
    );
  });

  return getAgentDetail(id);
}

export async function setAgentStatus(id: string, status: AgentStatus, actorId: string) {
  const agent = await db.agent.findUnique({ where: { id } });
  if (!agent) throw new NotFoundError("Agente");

  await db.$transaction(async (tx) => {
    await tx.agent.update({
      where: { id },
      data: { status, currentSubtaskId: status === AgentStatus.AVAILABLE ? null : agent.currentSubtaskId },
    });
    await logActivity(
      { actorType: "ADMIN", actorId, action: "agent.status.changed", entityType: "Agent", entityId: id, metadata: { status } },
      tx,
    );
  });
}
