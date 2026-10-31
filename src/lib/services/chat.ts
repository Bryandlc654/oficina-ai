import { completeForAgent } from "../../ai/manager";
import type { ChatMessage as AIChatMessage } from "../../ai/types";
import { publishOfficeEvent } from "../../realtime/publish";
import { cleanReply, extractTaskProposal, taskCreatedMarker, type CreatedTask } from "../chat-format";
import { db } from "../db";
import { NotFoundError } from "../errors";
import { taskCreateSchema } from "../validation";
import { extractUrls, formatWebPages, readWebPages } from "../web-reader";
import { retrieveAgentMemories, retrieveCompanyKnowledge } from "./memory-retrieval";
import { createTask } from "./tasks";

export const GROUP_CHANNEL = "group";
const HISTORY_LIMIT = 24;
const PAGE_SIZE = 100;
const MAX_GROUP_REPLIES = 4;
const EVERYONE = "todos";
const MAX_CHAT_PAGES = 2;

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
  // Models like typographic hyphens (@control‑calidad); slugs use plain ones.
  const normalized = content.replace(/[\u2010-\u2015]/g, "-");
  const tokens = new Set(
    Array.from(normalized.matchAll(/@([\p{L}\p{N}_-]+)/gu), (match) => (match[1] ?? "").toLowerCase()),
  );
  if (tokens.has(EVERYONE)) return agents.map((agent) => agent.id);
  return agents.filter((agent) => tokens.has(agent.slug.toLowerCase())).map((agent) => agent.id);
}

type ChatAdmin = { id: string; name: string };

export async function postAdminMessage(channel: string, content: string, admin: ChatAdmin) {
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
  void replyInTurn(channel, responders, agents, admin).catch((error) => {
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
async function replyInTurn(channel: string, agentIds: string[], agents: ChatAgent[], admin: ChatAdmin) {
  // One admin message gets at most one task; whoever speaks first schedules it.
  const chain: { task: CreatedTask | null } = { task: null };
  for (const agentId of agentIds) {
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        name: true,
        role: true,
        personality: true,
        responsibilities: true,
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

      const messages = toConversation(history.reverse(), agent.id, admin.name);
      if (messages.length === 0) continue;

      // Recent turns decide what the agent should recall about the company.
      const query = messages.slice(-3).map((message) => message.content).join("\n");
      const sharedUrls = extractUrls(messages[messages.length - 1]?.content ?? "").slice(0, MAX_CHAT_PAGES);
      const [knowledge, memories, pages] = await Promise.all([
        retrieveCompanyKnowledge(query, 3000),
        retrieveAgentMemories(agent.id, query, 1500),
        readWebPages(sharedUrls),
      ]);
      const system = chatSystemPrompt(agent, channel, agents, knowledge, memories, formatWebPages(pages), chain.task);

      // Small free models sometimes loop or switch language; one cooler retry usually fixes it.
      let text = "";
      for (const temperature of [0.5, 0.2]) {
        const result = await completeForAgent({
          agentId: agent.id,
          purpose: "chat",
          taskId: null,
          system,
          messages,
          maxOutputTokens: 500,
          temperature,
        });
        const cleaned = cleanReply(result.text);
        text = cleaned.text;
        if (!cleaned.degenerate) break;
      }

      text = text.replace(new RegExp(`^\\**${escapeRegExp(agent.name)}\\**:\\s*`, "i"), "");
      text = await scheduleProposedTask(text, agent.id, agents, admin.id, chain);
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

/** Turns a [[TAREA: …]] line into a real, running task so the team organizes itself. */
async function scheduleProposedTask(
  text: string,
  agentId: string,
  agents: ChatAgent[],
  adminId: string,
  chain: { task: CreatedTask | null },
): Promise<string> {
  const { body, proposal } = extractTaskProposal(text);
  if (!proposal) return text;

  if (chain.task) {
    await db.taskAssignment.createMany({
      data: [{ taskId: chain.task.id, agentId, role: "CONTRIBUTOR" }],
      skipDuplicates: true,
    });
    return `${body}\n${taskCreatedMarker(chain.task)}`;
  }

  // Teammates the agent named become contributors; "@todos" is not a team choice.
  const helpers = parseMentions(`${body}\n${proposal.objective}`.replace(/@todos\b/gi, ""), agents).filter(
    (id) => id !== agentId,
  );
  try {
    const input = taskCreateSchema.parse({
      title: proposal.title,
      objective: proposal.objective,
      agentIds: [agentId, ...helpers].slice(0, 10),
    });
    const task = await createTask(input, adminId);
    chain.task = { id: task.id, title: proposal.title };
    return `${body}\n${taskCreatedMarker(chain.task)}`;
  } catch (error) {
    // The proposal card stays, so the admin can still create it by hand.
    console.error("[chat] could not schedule proposed task", error);
    return text;
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
    const readable = readableMarkers(row.content);
    const content = mine ? readable : `${author}: ${readable}`;
    const previous = messages[messages.length - 1];
    // Providers want alternating turns, so consecutive turns of one side are merged.
    if (previous && previous.role === role) previous.content += `\n\n${content}`;
    else messages.push({ role, content });
  }
  while (messages[0]?.role === "assistant") messages.shift();
  if (messages[messages.length - 1]?.role !== "user") return [];
  return messages;
}

// Agents should see "task scheduled", not the raw marker they might then copy.
function readableMarkers(content: string): string {
  const { body, created } = extractTaskProposal(content);
  return created ? `${body}\n(Tarea agendada: «${created.title}»)` : content;
}

function chatSystemPrompt(
  agent: { name: string; role: string; personality: string; responsibilities: string; department: { name: string } },
  channel: string,
  agents: ChatAgent[],
  knowledge: string,
  memories: string,
  webPages: string,
  openTask: CreatedTask | null,
): string {
  const setting =
    channel === GROUP_CHANNEL
      ? `Estás en el chat grupal de la oficina con el administrador y tus compañeros:\n${agents
          .map((other) => `- ${other.name} (@${other.slug}): ${other.role}`)
          .join("\n")}\nPara sumar a alguien, menciónalo con @slug.`
      : "Estás en una conversación privada 1 a 1 con el administrador.";

  // Deliberately not the agent's task systemPrompt: that one asks for full formal deliverables.
  return `Eres ${agent.name}, ${agent.role} del departamento de ${agent.department.name}, en la oficina virtual de la empresa del administrador.
Personalidad: ${agent.personality}
Responsabilidades: ${agent.responsibilities}

${setting}

## Lo que sabes de la empresa
${knowledge || "No hay información registrada sobre la empresa."}

## Tu memoria
${memories || "Sin recuerdos relevantes."}

## Páginas web compartidas en el último mensaje
${webPages || "Ninguna."}

## Cómo responder en el chat
- Es un chat de trabajo, no un informe: responde en español, en primera persona y con naturalidad, en 2 a 6 frases (máximo unas 120 palabras).
- Nada de títulos, secciones numeradas ni planes completos. Como mucho, una lista corta de 3 puntos.
- Solo puedes leer las páginas cuyo enlace te compartan (su contenido aparece arriba); no tienes buscador ni acceso a cuentas privadas o métricas de redes sociales. Si te piden revisar una web sin enlace, pide el enlace. Nunca inventes datos de la empresa, cifras, clientes ni resultados: usa solo lo que sabes arriba o lo que diga el administrador.
- Trabajas con autonomía, como un profesional con experiencia: no pidas permiso ni esperes a tener todos los datos. Si falta algo, asume lo más razonable para una agencia como la nuestra y dilo en una frase ("asumo 5 páginas y WordPress").
- Solo pregunta si sin ese dato el trabajo no serviría, y como máximo una pregunta. Aun así, sigue adelante con tus supuestos.
- No le devuelvas el trabajo al administrador ni lo pases a otros sin aportar: di qué haces tú.
${
  openTask
    ? `- Para este pedido ya está agendada la tarea «${openTask.title}». No crees otra: di en una o dos frases qué parte vas a aportar tú, sin repetir lo que ya dijeron.`
    : `- Si te piden un trabajo de verdad (cotizaciones, auditorías, estrategias, documentos, campañas…), agéndalo tú mismo: el sistema crea la tarea y el equipo empieza al instante. Di con naturalidad que ya lo agendaste (por ejemplo "Lo agendo ya y lo armo con @designer") y añade al final, en una línea aparte, exactamente:
[[TAREA: título corto | objetivo detallado: qué entregar, supuestos que tomas y con quién colaboras (@slug)]]`
}
- No antepongas tu nombre a la respuesta.`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
