import Link from "next/link";
import { db } from "@/lib/db";
import { listCompanyKnowledge } from "@/lib/services/memory";
import type { KnowledgeKindValue } from "@/lib/constants";import { formatDateTime, initials, truncateLabel } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/ui";
import { KnowledgeManager } from "./knowledge-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Memoria" };

type MessageMetadata = { kind?: string; round?: number; approved?: boolean };

export default async function MemoryPage() {
  const [knowledge, agents, memories, messages] = await Promise.all([
    listCompanyKnowledge(),
    db.agent.findMany({
      select: { id: true, name: true, role: true, _count: { select: { memories: true } } },
      orderBy: { name: "asc" },
    }),
    db.agentMemory.findMany({
      include: { agent: { select: { id: true, name: true } } },
      orderBy: [{ updatedAt: "desc" }],
      take: 20,
    }),
    db.agentMessage.findMany({
      where: { OR: [{ fromAgentId: { not: null } }, { toAgentId: { not: null } }] },
      include: {
        task: { select: { id: true, title: true } },
        subtask: { select: { title: true } },
        fromAgent: { select: { name: true } },
        toAgent: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
  ]);

  const conversations = messages
    .filter((message) => {
      const metadata = message.metadata as MessageMetadata | null;
      return metadata?.kind === "correction" || metadata?.kind === "review_response";
    })
    .slice(0, 12);

  const activeKnowledge = knowledge.filter((entry) => entry.isActive).length;
  const agentProposals = memories.filter((memory) => memory.source?.startsWith("subtask:")).length;
  const totalAgentMemories = agents.reduce((total, agent) => total + agent._count.memories, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Conocimiento"
        title="Memoria"
        description="Tres niveles de memoria en MySQL: conocimiento empresarial compartido, memoria individual por empleado y memoria de tareas con conversaciones y entregables."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatCard label="Conocimiento activo" value={activeKnowledge} hint={`${knowledge.length} entradas totales`} />
        <StatCard label="Memoria individual" value={totalAgentMemories} hint={`${agents.length} empleados`} />
        <StatCard label="Propuestas por agentes" value={agentProposals} hint="aprendizajes persistidos" />
        <StatCard label="Mensajes de revisión" value={conversations.length} hint="correcciones y revisiones del PM" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <KnowledgeManager
          entries={knowledge.map((entry) => ({
            id: entry.id,
            kind: entry.kind as KnowledgeKindValue,
            category: entry.category,
            title: entry.title,
            content: entry.content,
            tags: Array.isArray(entry.tags)
              ? entry.tags.filter((tag): tag is string => typeof tag === "string")
              : [],
            isActive: entry.isActive,
            updatedAt: entry.updatedAt.toISOString(),
          }))}
        />

        <div className="space-y-5">
          <section className="panel">
            <div className="border-b border-white/6 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Empleados y memoria</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Edita la memoria individual desde la ficha de cada empleado.</p>
            </div>
            <ul className="divide-y divide-white/5">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link
                    href={`/employees/${agent.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.025]"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-[10px] font-semibold text-zinc-400">
                      {initials(agent.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-zinc-200">{agent.name}</span>
                      <span className="block truncate text-[10px] text-zinc-600">{agent.role}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-zinc-500">{agent._count.memories}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="border-b border-white/6 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Últimos aprendizajes</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Propuestas por agentes e incorporadas por el administrador.</p>
            </div>
            {memories.length === 0 ? (
              <p className="px-5 py-6 text-xs text-zinc-500">
                Sin memoria individual todavía. Los agentes proponen aprendizajes al cerrar subtareas.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {memories.slice(0, 8).map((memory) => (
                  <li key={memory.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/employees/${memory.agent.id}`}
                        className="truncate text-[11px] font-medium text-zinc-300 hover:text-white"
                      >
                        {memory.title}
                      </Link>
                      <span className="shrink-0 text-[9px] uppercase tracking-wider text-zinc-600">
                        {memory.source?.startsWith("subtask:") ? "agente" : "director"}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{memory.content}</p>
                    <p className="mt-1 text-[10px] text-zinc-600">{memory.agent.name}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="panel mt-5">
        <div className="border-b border-white/6 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Memoria de tareas y conversaciones</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Correcciones del Project Manager y resultados de revisión persistidos por tarea. Los objetivos, subtareas,
            resultados y entregables completos viven en la ficha de cada tarea.
          </p>
        </div>

        {conversations.length === 0 ? (
          <p className="px-5 py-6 text-xs text-zinc-500">
            Sin conversaciones registradas. Se generarán cuando el motor ejecute tareas y el Project Manager revise
            entregables.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {conversations.map((message) => {
              const metadata = message.metadata as MessageMetadata | null;
              return (
                <li key={message.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip border-white/10 bg-white/[0.04] text-[10px] text-zinc-400">
                      {metadata?.kind === "correction" ? "Corrección" : "Revisión del PM"}
                    </span>
                    {metadata?.round ? (
                      <span className="text-[10px] text-zinc-600">ronda {metadata.round}</span>
                    ) : null}
                    {typeof metadata?.approved === "boolean" ? (
                      <span className={metadata.approved ? "text-[10px] text-emerald-300" : "text-[10px] text-amber-300"}>
                        {metadata.approved ? "aprobado" : "con observaciones"}
                      </span>
                    ) : null}
                    <Link href={`/tasks/${message.task.id}`} className="ml-auto text-[11px] text-emerald-400 hover:text-emerald-300">
                      {truncateLabel(message.task.title, 60)}
                    </Link>
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                    {message.content}
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-600">
                    {message.fromAgent?.name ?? "Sistema"}
                    {message.toAgent ? ` → ${message.toAgent.name}` : ""}
                    {message.subtask ? ` · ${message.subtask.title}` : ""} · {formatDateTime(message.createdAt)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
