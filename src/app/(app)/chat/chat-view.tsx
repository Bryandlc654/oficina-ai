"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowUpRight, Hash, ListTodo, Send } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { useOfficeEvents, type OfficeEvent } from "@/components/realtime/realtime-provider";
import { extractTaskProposal, type CreatedTask, type TaskProposal } from "@/lib/chat-format";
import { AGENT_STATUS_DOT, AGENT_STATUS_LABELS } from "@/lib/constants";
import { cn, initials, timeAgo } from "@/lib/format";

type AgentStatusValue = keyof typeof AGENT_STATUS_LABELS;

type ChatAgent = {
  id: string;
  name: string;
  slug: string;
  role: string;
  status: AgentStatusValue;
  department: { name: string; color: string };
};

type Message = {
  id: string;
  channel: string;
  authorType: "ADMIN" | "AGENT" | "SYSTEM";
  agentId: string | null;
  content: string;
  createdAt: string;
  agent: { name: string; slug: string; department: { color: string } } | null;
};

const GROUP = "group";
const EVERYONE = { slug: "todos", name: "Todos", role: "Avisa a todo el equipo" };

export function ChatView({ agents, initialMessages }: { agents: ChatAgent[]; initialMessages: Message[] }) {
  const [channel, setChannel] = useState(GROUP);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [typing, setTyping] = useState<Record<string, string[]>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const channelRef = useRef(channel);
  channelRef.current = channel;

  const dmAgent = channel.startsWith("dm:") ? agents.find((agent) => `dm:${agent.id}` === channel) : undefined;
  const slugs = useMemo(() => new Set(agents.map((agent) => agent.slug.toLowerCase())), [agents]);

  const load = useCallback(async (target: string) => {
    const response = await fetch(`/api/chat/messages?channel=${encodeURIComponent(target)}`, { cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json()) as { messages: Message[] };
    if (channelRef.current === target) setMessages(data.messages);
  }, []);

  useEffect(() => {
    void load(channel);
    setUnread((current) => ({ ...current, [channel]: 0 }));
  }, [channel, load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, typing, channel]);

  useOfficeEvents((event: OfficeEvent) => {
    if (!event.channel) return;
    const target = event.channel;
    if (event.type === "chat.typing" && event.agentName) {
      const name = event.agentName;
      setTyping((current) => {
        const names = (current[target] ?? []).filter((entry) => entry !== name);
        return { ...current, [target]: event.status === "start" ? [...names, name] : names };
      });
    }
    if (event.type === "chat.message") {
      if (target === channelRef.current) void load(target);
      else setUnread((current) => ({ ...current, [target]: (current[target] ?? 0) + 1 }));
    }
  });

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const query = mention.query.toLowerCase();
    const options = channel === GROUP ? [EVERYONE, ...agents] : agents;
    return options
      .filter((option) => option.slug.toLowerCase().includes(query) || option.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [mention, agents, channel]);

  function updateMention(value: string, caret: number) {
    const match = /(^|\s)@([\p{L}\p{N}_-]*)$/u.exec(value.slice(0, caret));
    if (match) {
      setMention({ query: match[2] ?? "", start: caret - (match[2]?.length ?? 0) - 1 });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  }

  function pickMention(slug: string) {
    if (!mention) return;
    const caret = input.current?.selectionStart ?? draft.length;
    const next = `${draft.slice(0, mention.start)}@${slug} ${draft.slice(caret)}`;
    setDraft(next);
    setMention(null);
    const position = mention.start + slug.length + 2;
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(position, position);
    });
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, content }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "No se pudo enviar el mensaje");
      }
      setDraft("");
      setMention(null);
      await load(channel);
    } catch (sendError) {
      setError((sendError as Error).message);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && suggestions.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setMentionIndex((index) => (index + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickMention(suggestions[mentionIndex]?.slug ?? suggestions[0]!.slug);
        return;
      }
      if (event.key === "Escape") {
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const typingNames = typing[channel] ?? [];

  return (
    <div className="panel grid h-[calc(100vh-14rem)] min-h-[520px] overflow-hidden md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="flex gap-1 overflow-x-auto border-b border-white/[0.05] p-2 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
        <p className="hidden px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600 md:block">Canales</p>
        <ChannelButton active={channel === GROUP} unread={unread[GROUP]} onClick={() => setChannel(GROUP)}>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-emerald-300">
            <Hash className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">General</span>
        </ChannelButton>

        <p className="hidden px-2 pb-1 pt-4 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-600 md:block">
          Mensajes privados
        </p>
        {agents.map((agent) => (
          <ChannelButton
            key={agent.id}
            active={channel === `dm:${agent.id}`}
            unread={unread[`dm:${agent.id}`]}
            onClick={() => setChannel(`dm:${agent.id}`)}
          >
            <Avatar name={agent.name} color={agent.department.color} status={agent.status} />
            <span className="min-w-0">
              <span className="block truncate">{agent.name}</span>
              <span className="hidden truncate text-[10px] text-zinc-600 md:block">{agent.role}</span>
            </span>
          </ChannelButton>
        ))}
      </aside>

      <section className="flex min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b border-white/[0.05] px-4 py-3">
          {dmAgent ? (
            <>
              <Avatar name={dmAgent.name} color={dmAgent.department.color} status={dmAgent.status} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-zinc-100">{dmAgent.name}</p>
                <p className="truncate text-[11px] text-zinc-500">
                  {dmAgent.role} · {dmAgent.department.name} · {AGENT_STATUS_LABELS[dmAgent.status]}
                </p>
              </div>
            </>
          ) : (
            <div>
              <p className="text-[13px] font-medium text-zinc-100"># General</p>
              <p className="text-[11px] text-zinc-500">
                {agents.length} empleados · sin mención responde quien habló último
              </p>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <p className="py-10 text-center text-xs text-zinc-600">
              {dmAgent ? `Empieza una conversación con ${dmAgent.name}.` : "Todavía no hay mensajes. Saluda al equipo."}
            </p>
          ) : null}

          {messages.map((message) => {
            const { body, proposal, created } = extractTaskProposal(message.content);
            return message.authorType === "ADMIN" ? (
              <div key={message.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-emerald-500/15 px-3.5 py-2 text-[13px] leading-relaxed text-emerald-50">
                  <p className="whitespace-pre-wrap break-words">
                    <Highlighted text={message.content} slugs={slugs} />
                  </p>
                  <p className="mt-1 text-right text-[10px] text-emerald-200/40">{timeAgo(message.createdAt)}</p>
                </div>
              </div>
            ) : message.authorType === "SYSTEM" ? (
              <p key={message.id} className="text-center text-[11px] text-rose-300/80">
                {message.content}
              </p>
            ) : (
              <div key={message.id} className="flex gap-2.5">
                <Avatar name={message.agent?.name ?? "?"} color={message.agent?.department.color ?? "#52525b"} />
                <div className="min-w-0 max-w-[80%]">
                  <p className="mb-0.5 text-[11px] text-zinc-500">
                    <span className="font-medium text-zinc-300">{message.agent?.name}</span> · {timeAgo(message.createdAt)}
                  </p>
                  <div className="rounded-2xl rounded-tl-md bg-white/[0.04] px-3.5 py-2">
                    <Markdown content={body} className="[&_p:last-child]:mb-0 [&_p]:text-zinc-300" />
                  </div>
                  {created ? <ScheduledTaskCard task={created} /> : null}
                  {proposal && message.agentId ? (
                    <TaskProposalCard proposal={proposal} agentId={message.agentId} />
                  ) : null}
                </div>
              </div>
            );
          })}

          {typingNames.length > 0 ? (
            <p className="flex items-center gap-2 text-[11px] text-zinc-500">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {typingNames.join(", ")} {typingNames.length > 1 ? "están" : "está"} escribiendo…
            </p>
          ) : null}
          <div ref={bottom} />
        </div>

        <footer className="relative border-t border-white/[0.05] p-3">
          {mention && suggestions.length > 0 ? (
            <ul className="absolute bottom-full left-3 mb-1 w-72 overflow-hidden rounded-xl border border-white/10 bg-surface-900/95 py-1 shadow-xl shadow-black/50 backdrop-blur-xl">
              {suggestions.map((option, index) => (
                <li key={option.slug}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickMention(option.slug);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs",
                      index === mentionIndex ? "bg-white/[0.06] text-zinc-100" : "text-zinc-400",
                    )}
                  >
                    <span className="font-medium">{option.name}</span>
                    <span className="truncate text-[10px] text-zinc-600">@{option.slug} · {option.role}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {error ? <p className="mb-2 text-[11px] text-rose-300">{error}</p> : null}
          <div className="flex items-end gap-2">
            <textarea
              ref={input}
              value={draft}
              rows={1}
              placeholder={dmAgent ? `Mensaje privado a ${dmAgent.name}` : "Escribe al equipo… usa @ para mencionar"}
              onChange={(event) => {
                setDraft(event.target.value);
                updateMention(event.target.value, event.target.selectionStart);
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => setMention(null)}
              className="input max-h-40 min-h-[40px] flex-1 resize-none"
            />
            <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} className="btn-primary h-10">
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Enviar</span>
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ScheduledTaskCard({ task }: { task: CreatedTask }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-xs text-zinc-200 hover:bg-emerald-500/[0.09]"
    >
      <ListTodo className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-emerald-300/80">Tarea agendada · </span>
        {task.title}
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-emerald-300" />
    </Link>
  );
}

function TaskProposalCard({ proposal, agentId }: { proposal: TaskProposal; agentId: string }) {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: proposal.title, objective: proposal.objective, agentIds: [agentId] }),
      });
      const body = (await response.json().catch(() => null)) as
        | { task?: { id: string }; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.task) throw new Error(body?.error?.message ?? "No se pudo crear la tarea");
      setTaskId(body.task.id);
    } catch (createError) {
      setError((createError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-emerald-300/80">
        <ListTodo className="h-3 w-3" />
        Propuesta de tarea
      </p>
      <p className="mt-1 text-[13px] font-medium text-zinc-100">{proposal.title}</p>
      <p className="mt-0.5 line-clamp-3 text-[11px] leading-relaxed text-zinc-400">{proposal.objective}</p>
      {error ? <p className="mt-1.5 text-[11px] text-rose-300">{error}</p> : null}
      <div className="mt-2">
        {taskId ? (
          <Link href={`/tasks/${taskId}`} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-300 hover:text-emerald-200">
            Tarea creada · ver
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <button type="button" onClick={() => void create()} disabled={busy} className="btn-primary h-8 px-3 text-xs">
            {busy ? "Creando…" : "Crear tarea"}
          </button>
        )}
      </div>
    </div>
  );
}

function ChannelButton({
  active,
  unread,
  onClick,
  children,
}: {
  active: boolean;
  unread?: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors md:w-full",
        active ? "bg-white/[0.06] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.03] hover:text-zinc-200",
      )}
    >
      {children}
      {unread ? (
        <span className="ml-auto rounded-full bg-emerald-500 px-1.5 text-[10px] font-semibold text-black">{unread}</span>
      ) : null}
    </button>
  );
}

function Avatar({ name, color, status }: { name: string; color: string; status?: AgentStatusValue }) {
  return (
    <span className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-semibold text-black" style={{ backgroundColor: color }}>
      {initials(name)}
      {status ? (
        <span className={cn("absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-surface-900", AGENT_STATUS_DOT[status])} />
      ) : null}
    </span>
  );
}

/** Admin messages are plain text; only @mentions of real people get styled. */
function Highlighted({ text, slugs }: { text: string; slugs: Set<string> }) {
  const parts = text.split(/(@[\p{L}\p{N}_-]+)/u);
  return (
    <>
      {parts.map((part, index) => {
        const slug = part.startsWith("@") ? part.slice(1).toLowerCase() : null;
        return slug && (slugs.has(slug) || slug === EVERYONE.slug) ? (
          <span key={index} className="rounded bg-emerald-400/20 px-1 font-medium text-emerald-200">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        );
      })}
    </>
  );
}
