import { db } from "../db";
import { buildBudgetedBlock, rankByRelevance } from "./retrieval";

const KIND_PRIORITY: Record<string, number> = {
  PROCEDURE: 3,
  COMPANY: 2,
  GOAL: 2,
  SERVICE: 1,
  PRODUCT: 1,
  CLIENT: 1,
  DOCUMENT: 0,
};

export async function retrieveCompanyKnowledge(query: string, maxChars = 6000): Promise<string> {
  const entries = await db.companyKnowledge.findMany({
    where: { isActive: true },
    orderBy: [{ updatedAt: "desc" }],
    take: 60,
  });

  if (entries.length === 0) return "Sin conocimiento empresarial registrado.";

  const ranked = rankByRelevance(
    entries,
    query,
    (entry) => [entry.title, entry.category, entry.content],
    (entry) => KIND_PRIORITY[entry.kind] ?? 0,
  );

  const block = buildBudgetedBlock(
    ranked.map((entry) => ({
      heading: `### ${entry.title} [${entry.kind} · ${entry.category}]`,
      content: entry.content,
    })),
    maxChars,
  );

  return block || "Sin conocimiento empresarial relevante para este trabajo.";
}

export async function retrieveAgentMemories(agentId: string, query: string, maxChars = 3000): Promise<string> {
  const memories = await db.agentMemory.findMany({
    where: { agentId, scope: "AGENT" },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 40,
  });

  if (memories.length === 0) return "Sin memoria individual registrada.";

  const ranked = rankByRelevance(
    memories,
    query,
    (memory) => [memory.title, memory.content],
    (memory) => memory.importance * 2,
  );

  const block = buildBudgetedBlock(
    ranked.map((memory) => ({
      heading: `- ${memory.title}${memory.source ? ` (fuente: ${memory.source})` : ""}`,
      content: memory.content,
    })),
    maxChars,
  );

  return block || "Sin memoria individual relevante para este trabajo.";
}
