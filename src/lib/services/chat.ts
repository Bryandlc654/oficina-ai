import { completeForAgent } from "../../ai/manager";
import type { ChatMessage as AIChatMessage } from "../../ai/types";
import { publishOfficeEvent } from "../../realtime/publish";
import { db } from "../db";
import { NotFoundError } from "../errors";

export const GROUP_CHANNEL = "group";
const HISTORY_LIMIT = 24;
const PAGE_SIZE = 100;
const MAX_GROUP_REPLIES = 4;
const EVERYONE = "todos";

export function dmChannel(agentId: string): string {
  return `dm:${agentId}`;
}

function dmAgentId(channel: string): string | null {
  return channel.startsWith("dm:") ? channel.slice(3) : null;
}

export async function listChatAgents() {
  return db.agent.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      role: true,
      status: true,
      department: { select: { name: true, color: true } },
    },
    orderBy: [{ department: { order: "asc" } }, { name: "asc" }],
  });
}

type ChatAgent = Awaited<ReturnType<typeof listChatAgents>>[number];

export async function listChannelMessages(channel: string) {
  const rows = await db.chatMessage.findMany({
    where: { channel },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    include: { agent: { select: { name: true, slug: true, department: { select: { color: true } } } } },
  });
  return rows.reverse();
}

/** Agent ids mentioned as @slug; @todos mentions everyone. */
export function parseMentions(content: string, agents: { id: string; slug: string }[]): string[] {
  const tokens = new Set(
    Array.from(content.matchAll(/@([\p{L}\p{N}_-]+)/gu), (match) => (match[1] ?? "").toLowerCase()),
  );
  if (tokens.has(EVERYONE)) return agents.map((agent) => agent.id);
  return agents.filter((agent) => tokens.has(agent.slug.toLowerCase())).map((agent) => agent.id);
}

export async function postAdminMessage(channel: string, content: string, adminName: string) {
  const agents = await listChatAgents();
  const dmId = dmAgentId(channel);
  if (channel !== GROUP_CHANNEL && !(dmId && agents.some((agent) => agent.id === dmId))) {
    throw new NotFoundError("Canal");
  }

  const mentioned = dmId ? [] : parseMentions(content, agents);
  const message = await db.chatMessage.create({
    data: { channel, authorType: "ADMIN", content, mentions: mentioned.length > 0 ? mentioned : undefined },
  });
  await publishOfficeEvent({ type: "chat.message", channel });

  const responders = dmId
    ? [dmId]
    : mentioned.length > 0
      ? mentioned.slice(0, MAX_GROUP_REPLIES)
      : await defaultResponder(agents);

  // Replies take seconds; the client hears about them over realtime.
  void replyInTurn(channel, responders, agents, adminName).catch((error) => {
    console.error("[chat] reply chain failed", error);
  });

  return message;
}

/** Without mentions, whoever spoke last in the group keeps the conversation going. */
async function defaultResponder(agents: ChatAgent[]): Promise<string[]> {
  const last = await db.chatMessage.findFirst({
    where: { channel: GROUP_CHANNEL, authorType: "AGENT" },
    orderBy: { createdAt: "desc" },
    select: { agentId: true },
  });
  const id = last?.agentId ?? agents[0]?.id;
  return id ? [id] : [];
}

// Sequential so each agent sees what the previous ones just said.
async function replyInTurn(channel: string, agentIds: string[], agents: ChatAgent[], adminName: string) {
  for (const agentId of agentIds) {
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        name: true,
        role: true,
        personality: true,
        systemPrompt: true,
        department: { select: { name: true } },
      },
    });
    if (!agent) continue;

    await publishOfficeEvent({ type: "chat.typing", channel, agentId, agentName: agent.name, status: "start" });
    try {
      const history = await db.chatMessage.findMany({
        where: { channel, authorType: { in: ["ADMIN", "AGENT"] } },
        orderBy: { createdAt: "desc" },
        take: HISTORY_LIMIT,
        include: { agent: { select: { name: true } } },
      });

      const messages = toConversation(history.reverse(), agent.id, adminName);
      if (messages.length === 0) continue;

      const result = await completeForAgent({
        agentId: agent.id,
        taskId: null,
        system: chatSystemPrompt(agent, channel, agents),
        messages,
        maxOutputTokens: 700,
        temperature: 0.7,
      });

      const text = result.text.trim().replace(new RegExp(`^\\**${escapeRegExp(agent.name)}\\**:\\s*`, "i"), "");
      await db.chatMessage.create({
        data: { channel, authorType: "AGENT", agentId: agent.id, content: text || "…" },
      });
    } catch (error) {
      await db.chatMessage.create({
        data: {
          channel,
          authorType: "SYSTEM",
          agentId: agent.id,
          content: `${agent.name} no pudo responder: ${(error as Error).message}`,
        },
      });
    } finally {
      await publishOfficeEvent({ type: "chat.typing", channel, agentId, agentName: agent.name, status: "stop" });
      await publishOfficeEvent({ type: "chat.message", channel });
    }
  }
}

function toConversation(
  rows: { authorType: string; agentId: string | null; content: string; agent: { name: string } | null }[],
  selfId: string,
  adminName: string,
): AIChatMessage[] {
  const messages: AIChatMessage[] = [];
  for (const row of rows) {
    const mine = row.authorType === "AGENT" && row.agentId === selfId;
    const role = mine ? "assistant" : "user";
    const author = row.authorType === "ADMIN" ? `${adminName} (administrador)` : (row.agent?.name ?? "Compañero");
    const content = mine ? row.content : `${author}: ${row.content}`;
    const previous = messages[messages.length - 1];
    // Providers want alternating turns, so consecutive turns of one side are merged.
    if (previous && previous.role === role) previous.content += `\n\n${content}`;
    else messages.push({ role, content });
  }
  while (messages[0]?.role === "assistant") messages.shift();
  if (messages[messages.length - 1]?.role !== "user") return [];
  return messages;
}

function chatSystemPrompt(
  agent: { name: string; role: string; personality: string; systemPrompt: string; department: { name: string } },
  channel: string,
  agents: ChatAgent[],
): string {
  const setting =
    channel === GROUP_CHANNEL
      ? `Estás en el chat grupal de la oficina con el administrador y tus compañeros:\n${agents
          .map((other) => `- ${other.name} (@${other.slug}): ${other.role}`)
          .join("\n")}\nPuedes dirigirte a un compañero con @slug si de verdad hace falta.`
      : "Estás en una conversación privada 1 a 1 con el administrador.";

  return `${agent.systemPrompt}

## Chat interno de la oficina
Eres ${agent.name}, ${agent.role} del departamento de ${agent.department.name}.
Personalidad: ${agent.personality}
${setting}

Responde en español, con naturalidad y en primera persona, como en un chat de trabajo: breve (1 a 4 frases) salvo que te pidan detalle.
No afirmes haber ejecutado trabajos que no has hecho; si te piden algo grande, propón crearlo como tarea.
No antepongas tu nombre a la respuesta.`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
