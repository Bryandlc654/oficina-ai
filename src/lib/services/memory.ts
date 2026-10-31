import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { NotFoundError } from "../errors";
import type {
  AgentMemoryCreateInput,
  AgentMemoryUpdateInput,
  KnowledgeCreateInput,
  KnowledgeUpdateInput,
} from "../validation";
import { logActivity } from "./activity";

export async function listCompanyKnowledge() {
  return db.companyKnowledge.findMany({ orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] });
}

export async function createKnowledge(input: KnowledgeCreateInput, actorId: string) {
  const entry = await db.companyKnowledge.create({
    data: {
      kind: input.kind,
      category: input.category,
      title: input.title,
      content: input.content,
      tags: input.tags,
      isActive: input.isActive,
    },
  });

  await logActivity({
    actorType: "ADMIN",
    actorId,
    action: "knowledge.created",
    entityType: "CompanyKnowledge",
    entityId: entry.id,
    metadata: { title: entry.title, kind: entry.kind },
  });

  return entry;
}

export async function updateKnowledge(id: string, input: KnowledgeUpdateInput, actorId: string) {
  const existing = await db.companyKnowledge.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Conocimiento");

  const data: Prisma.CompanyKnowledgeUpdateInput = {};
  if (input.kind !== undefined) data.kind = input.kind;
  if (input.category !== undefined) data.category = input.category;
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) data.content = input.content;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const entry = await db.companyKnowledge.update({ where: { id }, data });

  await logActivity({
    actorType: "ADMIN",
    actorId,
    action: "knowledge.updated",
    entityType: "CompanyKnowledge",
    entityId: id,
    metadata: { title: entry.title, fields: Object.keys(input) },
  });

  return entry;
}

export async function deleteKnowledge(id: string, actorId: string) {
  const existing = await db.companyKnowledge.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Conocimiento");

  await db.companyKnowledge.delete({ where: { id } });

  await logActivity({
    actorType: "ADMIN",
    actorId,
    action: "knowledge.deleted",
    entityType: "CompanyKnowledge",
    entityId: id,
    metadata: { title: existing.title, kind: existing.kind },
  });
}

export async function listAgentMemories(agentId: string) {
  return db.agentMemory.findMany({
    where: { agentId },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
  });
}

export async function createAgentMemory(agentId: string, input: AgentMemoryCreateInput, actorId: string) {
  const agent = await db.agent.findUnique({ where: { id: agentId }, select: { id: true, name: true } });
  if (!agent) throw new NotFoundError("Agente");

  const memory = await db.agentMemory.create({
    data: {
      agentId,
      scope: "AGENT",
      title: input.title,
      content: input.content,
      importance: input.importance,
      tags: input.tags,
      source: "admin",
    },
  });

  await logActivity({
    actorType: "ADMIN",
    actorId,
    action: "agent_memory.created",
    entityType: "AgentMemory",
    entityId: memory.id,
    metadata: { agentId, agentName: agent.name, title: memory.title },
  });

  return memory;
}

export async function updateAgentMemory(id: string, input: AgentMemoryUpdateInput, actorId: string) {
  const existing = await db.agentMemory.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Memoria");

  const data: Prisma.AgentMemoryUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.content !== undefined) data.content = input.content;
  if (input.importance !== undefined) data.importance = input.importance;
  if (input.tags !== undefined) data.tags = input.tags;

  const memory = await db.agentMemory.update({ where: { id }, data });

  await logActivity({
    actorType: "ADMIN",
    actorId,
    action: "agent_memory.updated",
    entityType: "AgentMemory",
    entityId: id,
    metadata: { agentId: existing.agentId, title: memory.title, fields: Object.keys(input) },
  });

  return memory;
}

export async function deleteAgentMemory(id: string, actorId: string) {
  const existing = await db.agentMemory.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Memoria");

  await db.agentMemory.delete({ where: { id } });

  await logActivity({
    actorType: "ADMIN",
    actorId,
    action: "agent_memory.deleted",
    entityType: "AgentMemory",
    entityId: id,
    metadata: { agentId: existing.agentId, title: existing.title },
  });
}
