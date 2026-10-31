import { db } from "../db";

/**
 * How employees learn without spending tokens: lessons come from signals the office
 * already has (the director's feedback, chat instructions, quality corrections, the
 * agent's own short proposals). No extra model call is ever made to learn.
 */

// Learned memories per employee; admin-written ones never count and are never pruned.
const MAX_LEARNED = 30;
const SAME_LESSON = 0.55;

type MemoryClient = Pick<typeof db, "agentMemory">;

export type Lesson = {
  content: string;
  /** 3 = director, 2 = quality control, 1 = the agent's own proposal. */
  importance: 1 | 2 | 3;
  source: string;
  kind: "director_feedback" | "chat_instruction" | "qa_correction" | "agent_proposal";
  taskId?: string;
};

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3),
  );
}

/** Word overlap (Jaccard) between two lessons, 0 to 1. */
export function lessonSimilarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/**
 * Stores a lesson, merging it into a near-identical one instead of duplicating it. A
 * lesson learned again gains importance, so repeated lessons surface first.
 */
export async function rememberLesson(agentId: string, lesson: Lesson, client: MemoryClient = db): Promise<void> {
  const content = lesson.content.replace(/\s+/g, " ").trim().slice(0, 600);
  if (content.length < 15) return;

  const known = await client.agentMemory.findMany({
    where: { agentId, scope: "AGENT" },
    select: { id: true, content: true, importance: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const same = known.find((memory) => lessonSimilarity(memory.content, content) >= SAME_LESSON);

  if (same) {
    await client.agentMemory.update({
      where: { id: same.id },
      data: { content, importance: Math.min(3, Math.max(same.importance, lesson.importance) + 1) },
    });
    return;
  }

  await client.agentMemory.create({
    data: {
      agentId,
      scope: "AGENT",
      title: content.slice(0, 80),
      content,
      importance: lesson.importance,
      source: lesson.source,
      tags: { kind: lesson.kind, ...(lesson.taskId ? { taskId: lesson.taskId } : {}) },
    },
  });

  // Forget the least important, oldest lessons so the prompt budget stays useful.
  const learned = await client.agentMemory.findMany({
    where: { agentId, scope: "AGENT", NOT: { source: "admin" } },
    select: { id: true },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    skip: MAX_LEARNED,
  });
  if (learned.length > 0) {
    await client.agentMemory.deleteMany({ where: { id: { in: learned.map((memory) => memory.id) } } });
  }
}

const CHAT_INSTRUCTION =
  /\b(recuerda|recuerden|recu[eé]rdalo|de ahora en adelante|a partir de ahora|siempre|nunca|no vuelvas a|no vuelvan a|prefiero|tengan en cuenta|ten en cuenta|toma nota|tomen nota)\b/i;

/** A chat line that tells the team how to work from now on, cleaned up to store. */
export function chatInstruction(content: string): string | null {
  if (!CHAT_INSTRUCTION.test(content)) return null;
  const text = content.replace(/@[\p{L}\p{N}_-]+/gu, "").replace(/\s+/g, " ").trim();
  return text.length >= 15 && text.length <= 600 ? text : null;
}
