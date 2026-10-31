import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle, FileDown, GitBranch, Layers, Target } from "lucide-react";
import { getTaskDetail } from "@/lib/services/tasks";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import {
  DELIVERABLE_TYPE_LABELS,
  APPROVAL_STATUS_LABELS,
  RUN_STATUS_LABELS,
  SCHEDULE_STATUS_LABELS,
  SUBTASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_TONE,
  TASK_STATUS_LABELS,
  TASK_STATUS_TONE,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/constants";
import { cn, formatDateTime, formatTokens, humanizeAction, timeAgo } from "@/lib/format";
import { EmptyState, Panel } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { DownloadDeliverable } from "@/components/download-deliverable";
import { TaskActions } from "./task-actions";
import { TaskEditDialog } from "./task-edit-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tarea" };

const RUN_STATUS_TONE: Record<string, string> = {
  QUEUED: "border-zinc-600/40 bg-zinc-500/10 text-zinc-300",
  RUNNING: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  SUCCEEDED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  FAILED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  CANCELLED: "border-zinc-700/40 bg-zinc-700/20 text-zinc-400",
};

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let task;
  try {
    task = await getTaskDetail(id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const status = task.status as TaskStatus;
  const history = await db.activityLog.findMany({
    where: { entityType: "Task", entityId: task.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const taskMessages = await db.agentMessage.findMany({
    where: { taskId: task.id },
    include: {
      fromAgent: { select: { name: true } },
      toAgent: { select: { name: true } },
      subtask: { select: { title: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 80,
  });
  const conversation = taskMessages
    .filter((message) => {
      const metadata = message.metadata as { kind?: string } | null;
      return metadata?.kind === "correction" || metadata?.kind === "review_response";
    })
    .slice(-10);
  const completedSubtasks = task.subtasks.filter((subtask) => subtask.status === "COMPLETED").length;
  const progress = task.subtasks.length > 0 ? Math.round((completedSubtasks / task.subtasks.length) * 100) : 0;

  return (
    <div>
      <Link href="/tasks" className="mb-5 inline-flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-200">
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a tareas
      </Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("chip border text-[11px]", TASK_STATUS_TONE[status])}>{TASK_STATUS_LABELS[status]}</span>
            <span className={cn("chip border text-[11px]", TASK_PRIORITY_TONE[task.priority as TaskPriority])}>
              {TASK_PRIORITY_LABELS[task.priority as TaskPriority]}
            </span>
            {task.project ? (
              <span className="chip border-white/10 bg-white/[0.04] text-zinc-400">{task.project.name}</span>
            ) : null}
            {task.pausedAt ? (
              <span className="chip border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300">
                Pausada
              </span>
            ) : null}
            {task.approvalStatus === "PENDING" ? (
              <span className="chip border-sky-500/25 bg-sky-500/10 text-[11px] text-sky-300">
                Pendiente de aprobación
              </span>
            ) : null}
            {task.department ? (
              <span
                className="chip border"
                style={{
                  borderColor: `${task.department.color}40`,
                  backgroundColor: `${task.department.color}12`,
                  color: task.department.color,
                }}
              >
                {task.department.name}
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">{task.title}</h1>
          <p className="mt-1 text-xs text-zinc-500">
            Creada por {task.createdBy.name} · {formatDateTime(task.createdAt)} · {formatTokens(task.tokensUsed)} tokens consumidos
          </p>
        </div>
        <TaskEditDialog
          task={{
            id: task.id,
            title: task.title,
            objective: task.objective,
            description: task.description,
            priority: task.priority as TaskPriority,
          }}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Panel>
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-400/80" />
              <h2 className="text-sm font-semibold text-white">Objetivo</h2>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{task.objective}</p>

            {task.description ? (
              <>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500">Contexto</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{task.description}</p>
              </>
            ) : null}
          </Panel>

          {task.errorMessage ? (
            <div className="rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] p-5">
              <div className="flex items-center gap-2 text-rose-300">
                <AlertTriangle className="h-4 w-4" />
                <h2 className="text-sm font-semibold">Error de ejecución</h2>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-rose-200/80">{task.errorMessage}</p>
            </div>
          ) : null}

          <section className="panel">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-zinc-500" />
                <h2 className="text-sm font-semibold text-white">Plan de subtareas</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">
                  {completedSubtasks}/{task.subtasks.length} completadas · {progress}%
                </span>
              </div>
            </div>

            {task.subtasks.length > 0 ? (
              <div className="px-5 pt-3">
                <div className="h-1 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-emerald-400/60 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : null}

            {task.subtasks.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Aún sin plan de trabajo"
                  description="El Project Manager generará las subtareas, dependencias y responsables cuando se conecte el motor multiaagente (fase 2)."
                />
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {task.subtasks.map((subtask) => (
                  <li key={subtask.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">
                          {subtask.order}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-200">{subtask.title}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {subtask.assignedAgent?.name ?? "Sin asignar"} · {SUBTASK_STATUS_LABELS[subtask.status] ?? subtask.status}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] text-zinc-600">{formatTokens(subtask.tokensUsed)} tokens</span>
                    </div>

                    {subtask.dependencies.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-7 text-[11px] text-zinc-500">
                        <GitBranch className="h-3 w-3" />
                        Depende de: {subtask.dependencies.map((dependency) => dependency.dependsOn.title).join(", ")}
                      </div>
                    ) : null}

                    {subtask.result ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
                          Ver resultado
                        </summary>
                        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/[0.06] bg-black/20 p-3">
                          <Markdown content={subtask.result} />
                        </div>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Entregables</h2>
              <span className="text-xs text-zinc-500">{task.deliverables.length}</span>
            </div>

            {task.deliverables.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Sin entregables"
                  description="Los documentos, informes, análisis y código producidos por los agentes aparecerán aquí."
                />
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {task.deliverables.map((deliverable) => (
                  <li key={deliverable.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-200">{deliverable.title}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">
                          {DELIVERABLE_TYPE_LABELS[deliverable.type] ?? deliverable.type} · {deliverable.agent.name} ·{" "}
                          {formatDateTime(deliverable.createdAt)}
                        </p>
                      </div>
                      <DownloadDeliverable
                        title={deliverable.title}
                        content={deliverable.content}
                        fileUrl={deliverable.fileUrl}
                        fileName={deliverable.fileName}
                      />
                    </div>
                    {deliverable.content ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">Ver contenido</summary>
                        <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-white/[0.06] bg-black/20 p-4">
                          <Markdown content={deliverable.content} />
                        </div>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {task.finalReport ? (
            <Panel>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-white">Informe final</h2>
                <Link href={`/print/tasks/${task.id}`} target="_blank" className="btn-secondary px-2.5 py-1 text-[11px]">
                  <FileDown className="h-3.5 w-3.5" />
                  Descargar PDF
                </Link>
              </div>
              <div className="mt-3">
                <Markdown content={task.finalReport} />
              </div>
            </Panel>
          ) : null}

          <section className="panel">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Ejecuciones de agentes</h2>
              <span className="text-xs text-zinc-500">{task.runs.length}</span>
            </div>

            {task.runs.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Sin ejecuciones"
                  description="Cada llamada a un proveedor de IA se registrará con modelo, tokens, latencia y resultado."
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="table-head">
                      <th className="px-5 py-3">Agente</th>
                      <th className="px-5 py-3">Estado</th>
                      <th className="px-5 py-3">Modelo</th>
                      <th className="px-5 py-3">Tokens</th>
                      <th className="px-5 py-3">Inicio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {task.runs.map((run) => (
                      <tr key={run.id} className="table-row">
                        <td className="px-5 py-3 text-xs text-zinc-300">{run.agent.name}</td>
                        <td className="px-5 py-3">
                          <span className={cn("chip border text-[10px]", RUN_STATUS_TONE[run.status] ?? RUN_STATUS_TONE.QUEUED)}>
                            {RUN_STATUS_LABELS[run.status] ?? run.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-[11px] text-zinc-500">{run.model}</td>
                        <td className="px-5 py-3 text-xs text-zinc-400">{run.totalTokens}</td>
                        <td className="px-5 py-3 text-xs text-zinc-500">{timeAgo(run.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Historial de la tarea</h2>
              <span className="text-xs text-zinc-500">{history.length} eventos</span>
            </div>
            {history.length === 0 ? (
              <p className="px-5 py-5 text-xs text-zinc-500">Sin eventos registrados.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {history.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-xs text-zinc-300">
                        <span className="font-medium text-zinc-200">
                          {entry.actorType === "ADMIN" ? "Director" : entry.actorType === "SYSTEM" ? "Sistema" : "Agente"}
                        </span>{" "}
                        {humanizeAction(entry.action)}
                      </p>
                      {entry.metadata ? (
                        <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">
                          {JSON.stringify(entry.metadata)}
                        </p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-600">{timeAgo(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Comunicación y revisión</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Correcciones del Project Manager y resultados de revisión.</p>
              </div>
              <span className="text-xs text-zinc-500">{conversation.length}</span>
            </div>
            {conversation.length === 0 ? (
              <p className="px-5 py-5 text-xs text-zinc-500">
                Sin mensajes de revisión. Aparecerán cuando el Project Manager revise los entregables.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {conversation.map((message) => {
                  const metadata = message.metadata as { kind?: string; round?: number; approved?: boolean; passed?: boolean; score?: number } | null;
                  return (
                    <li key={message.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="chip border-white/10 bg-white/[0.04] text-[10px] text-zinc-400">
                          {metadata?.kind === "correction" ? "Corrección" : "Revisión"}
                        </span>
                        {metadata?.round ? <span className="text-[10px] text-zinc-600">ronda {metadata.round}</span> : null}
                        {typeof (metadata?.passed ?? metadata?.approved) === "boolean" ? (
                          <span className={(metadata?.passed ?? metadata?.approved) ? "text-[10px] text-emerald-300" : "text-[10px] text-amber-300"}>
                            {typeof metadata?.score === "number" ? `${metadata.score}/10 · ` : ""}
                            {(metadata?.passed ?? metadata?.approved) ? "aprobado" : "con observaciones"}
                          </span>
                        ) : null}
                        <span className="ml-auto text-[10px] text-zinc-600">{timeAgo(message.createdAt)}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                        {message.content}
                      </p>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {message.fromAgent?.name ?? "Sistema"}
                        {message.toAgent ? ` → ${message.toAgent.name}` : ""}
                        {message.subtask ? ` · ${message.subtask.title}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <TaskActions
            taskId={task.id}
            status={task.status}
            scheduledFor={task.scheduledFor?.toISOString() ?? null}
            pausedAt={task.pausedAt?.toISOString() ?? null}
            approvalStatus={task.approvalStatus}
          />

          <Panel>
            <h2 className="text-sm font-semibold text-white">Detalles</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Programada</dt>
                <dd className="text-right text-zinc-300">{formatDateTime(task.scheduledFor)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Inicio real</dt>
                <dd className="text-right text-zinc-300">{formatDateTime(task.startedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Finalización</dt>
                <dd className="text-right text-zinc-300">{formatDateTime(task.completedAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Iteraciones máx.</dt>
                <dd className="text-right text-zinc-300">{task.maxIterations}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Consumo</dt>
                <dd className="text-right text-zinc-300">{formatTokens(task.tokensUsed)} tokens</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Aprobación</dt>
                <dd className="text-right text-zinc-300">
                  {APPROVAL_STATUS_LABELS[task.approvalStatus] ?? task.approvalStatus}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel>
            <h2 className="text-sm font-semibold text-white">Equipo asignado</h2>
            {task.assignments.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-500">Sin asignaciones manuales. El Project Manager propondrá el equipo.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {task.assignments.map((assignment) => (
                  <li key={assignment.id}>
                    <Link
                      href={`/employees/${assignment.agent.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-black/20 px-3 py-2 transition hover:border-white/12"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-zinc-200">{assignment.agent.name}</span>
                        <span className="block truncate text-[10px] text-zinc-600">{assignment.agent.role}</span>
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-500">{assignment.role}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <h2 className="text-sm font-semibold text-white">Cola de ejecución</h2>
            {task.scheduledJobs.length === 0 ? (
              <p className="mt-3 text-xs text-zinc-500">
                BullMQ se conecta en la fase 2. Las tareas programadas no se ejecutan todavía en segundo plano.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {task.scheduledJobs.map((job) => (
                  <li key={job.id} className="rounded-lg border border-white/6 bg-black/20 px-3 py-2">
                    <p className="text-[11px] text-zinc-300">{job.queue}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {SCHEDULE_STATUS_LABELS[job.status] ?? job.status} · {formatDateTime(job.runAt)} · intento {job.attempts}
                    </p>
                    {job.lastError ? (
                      <p className="mt-1 line-clamp-3 text-[10px] text-rose-300/80">{job.lastError}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
