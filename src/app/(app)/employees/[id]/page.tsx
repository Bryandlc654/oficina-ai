import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileText, Play } from "lucide-react";
import { db } from "@/lib/db";
import { getAgentDetail } from "@/lib/services/agents";
import { listProviders } from "@/lib/services/providers";
import { previewAutoModels } from "@/ai/manager";
import { QA_SLUG, PM_SLUG } from "@/engine/quality";
import { NotFoundError } from "@/lib/errors";
import { AGENT_STATUS_DOT, AGENT_STATUS_LABELS, DELIVERABLE_TYPE_LABELS, RUN_STATUS_LABELS } from "@/lib/constants";
import { formatDateTime, initials, timeAgo } from "@/lib/format";
import { AgentForm } from "./agent-form";
import { AgentMemoryManager } from "./agent-memory-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empleado" };

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let agent;
  try {
    agent = await getAgentDetail(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const departments = await db.department.findMany({
    select: { id: true, name: true },
    orderBy: { order: "asc" },
  });
  const providers = await listProviders();
  const autoRanking = await previewAutoModels(agent.slug === QA_SLUG || agent.slug === PM_SLUG ? "review" : "work");

  return (
    <div>
      <Link href="/employees" className="mb-5 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-200">
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a empleados
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span
            className="grid h-14 w-14 place-items-center rounded-2xl border text-base font-semibold"
            style={{
              borderColor: `${agent.department.color}55`,
              backgroundColor: `${agent.department.color}18`,
              color: agent.department.color,
            }}
          >
            {initials(agent.name)}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{agent.name}</h1>
            <p className="mt-0.5 text-sm text-zinc-400">
              {agent.role} · {agent.department.name}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="chip border-white/10 bg-white/[0.03] text-zinc-300">
            <span className={`h-1.5 w-1.5 rounded-full ${AGENT_STATUS_DOT[agent.status]}`} />
            {AGENT_STATUS_LABELS[agent.status]}
          </span>
          <span className="chip border-white/10 bg-white/[0.03] text-zinc-400">
            {agent.autoModel ? `Automático · ${autoRanking[0]?.model ?? "sin modelos"}` : agent.model}
          </span>
          <span className="chip border-white/10 bg-white/[0.03] text-zinc-400">
            {agent._count.runs} ejecuciones
          </span>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <AgentForm
          agent={{
            id: agent.id,
            name: agent.name,
            role: agent.role,
            personality: agent.personality,
            responsibilities: agent.responsibilities,
            systemPrompt: agent.systemPrompt,
            model: agent.model,
            fallbackModel: agent.fallbackModel,
            autoModel: agent.autoModel,
            maxIterations: agent.maxIterations,
            dailyTokenLimit: agent.dailyTokenLimit,
            status: agent.status,
            departmentId: agent.departmentId,
            providerId: agent.providerId,
            fallbackProviderId: agent.fallbackProviderId,
            tools: agent.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              isEnabled: tool.isEnabled,
              requiresApproval: tool.requiresApproval,
            })),
          }}
          departments={departments}
          autoRanking={autoRanking}
          providers={providers.map((provider) => ({
            id: provider.id,
            name: provider.name,
            type: provider.type,
            isEnabled: provider.isEnabled,
            hasKey: provider.hasKey,
          }))}
        />

        <div className="space-y-5">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold text-white">Contexto actual</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Tarea actual</dt>
                <dd className="text-right text-zinc-300">{agent.currentSubtask?.title ?? "Ninguna"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Proveedor</dt>
                <dd className="text-right text-zinc-300">{agent.provider?.name ?? "Sin asignar"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Fallback</dt>
                <dd className="text-right text-zinc-300">{agent.fallbackProvider?.name ?? "Sin asignar"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Entregables</dt>
                <dd className="text-right text-zinc-300">{agent._count.deliverables}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Memorias</dt>
                <dd className="text-right text-zinc-300">{agent._count.memories}</dd>
              </div>
            </dl>
          </section>

          <section className="panel">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-white">Últimas ejecuciones</h2>
              <Play className="h-3.5 w-3.5 text-zinc-600" />
            </div>
            {agent.runs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">Sin ejecuciones registradas.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {agent.runs.map((run) => (
                  <li key={run.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-medium text-zinc-300">
                        {run.subtask?.title ?? run.task.title}
                      </p>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-600">{RUN_STATUS_LABELS[run.status] ?? run.status}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-zinc-600">
                      {timeAgo(run.createdAt)} · {run.totalTokens} tokens · intento {run.attempt}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-white">Entregables</h2>
              <FileText className="h-3.5 w-3.5 text-zinc-600" />
            </div>
            {agent.deliverables.length === 0 ? (
              <p className="px-5 py-6 text-sm text-zinc-500">Sin entregables todavía.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {agent.deliverables.map((deliverable) => (
                  <li key={deliverable.id} className="px-5 py-3">
                    <Link href={`/tasks/${deliverable.task.id}`} className="text-xs font-medium text-zinc-300 hover:text-white">
                      {deliverable.title}
                    </Link>
                    <p className="mt-0.5 text-[11px] text-zinc-600">
                      {DELIVERABLE_TYPE_LABELS[deliverable.type] ?? deliverable.type} · {formatDateTime(deliverable.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <AgentMemoryManager
            agentId={agent.id}
            memories={agent.memories.map((memory) => ({
              id: memory.id,
              title: memory.title,
              content: memory.content,
              importance: memory.importance,
              source: memory.source,
              updatedAt: memory.updatedAt.toISOString(),
            }))}
          />

          <p className="flex items-start gap-2 px-1 text-[11px] text-zinc-600">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/60" />
            Los agentes no pueden modificar su propio system prompt ni sus permisos. Solo el director puede hacerlo.
          </p>
        </div>
      </div>
    </div>
  );
}
