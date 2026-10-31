import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Coins, ListTodo, Users } from "lucide-react";
import { db } from "@/lib/db";
import { AGENT_STATUS_DOT, AGENT_STATUS_LABELS, TASK_STATUS_LABELS, TASK_STATUS_TONE } from "@/lib/constants";
import type { AgentStatus, TaskStatus } from "@prisma/client";
import { formatDateTime, formatTokens, humanizeAction, initials, timeAgo } from "@/lib/format";
import { EmptyState, PageHeader, SectionHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resumen" };

const ACTIVE_TASK_STATUSES: TaskStatus[] = ["PENDING", "PLANNING", "RUNNING", "REVIEW"];
const CLOSED_TASK_STATUSES: TaskStatus[] = ["COMPLETED", "FAILED", "CANCELLED"];

export default async function DashboardPage() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [taskGroups, agentGroups, deliverableCount, usage, activity, upcoming, agents, knowledgeCount] =
    await Promise.all([
      db.task.groupBy({ by: ["status"], _count: { _all: true } }),
      db.agent.groupBy({ by: ["status"], _count: { _all: true } }),
      db.deliverable.count(),
      db.aIUsage.aggregate({
        where: { createdAt: { gte: startOfMonth } },
        _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
      }),
      db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
      db.task.findMany({
        where: { status: "SCHEDULED", scheduledFor: { not: null } },
        orderBy: { scheduledFor: "asc" },
        take: 5,
        include: { assignments: { include: { agent: { select: { name: true } } } } },
      }),
      db.agent.findMany({
        include: {
          department: { select: { name: true, color: true } },
          currentSubtask: { select: { title: true, task: { select: { id: true, title: true } } } },
        },
        orderBy: [{ department: { order: "asc" } }, { name: "asc" }],
      }),
      db.companyKnowledge.count({ where: { isActive: true } }),
    ]);

  const taskCount = (status: TaskStatus) => taskGroups.find((group) => group.status === status)?._count._all ?? 0;
  const agentCount = (status: AgentStatus) => agentGroups.find((group) => group.status === status)?._count._all ?? 0;

  const activeTasks = ACTIVE_TASK_STATUSES.reduce((sum, status) => sum + taskCount(status), 0);
  const completedTasks = CLOSED_TASK_STATUSES.reduce((sum, status) => sum + taskCount(status), 0);
  const totalTokens = usage._sum.totalTokens ?? 0;
  const workingAgents = agentCount("WORKING");
  const taskTotal = taskGroups.reduce((sum, group) => sum + group._count._all, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Panel"
        title="Resumen general"
        description="Estado real de la oficina: equipo, tareas y entregables registrados en la base de datos."
        actions={
          <Link href="/tasks" className="btn-primary">
            Gestionar tareas
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Equipo activo"
          value={`${workingAgents}/${agents.length}`}
          hint={`${agentCount("AVAILABLE")} disponibles · ${agentCount("OFFLINE")} desconectados`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Tareas en curso"
          value={activeTasks}
          hint={`${taskCount("SCHEDULED")} programadas`}
          icon={<ListTodo className="h-4 w-4" />}
        />
        <StatCard
          label="Tareas cerradas"
          value={completedTasks}
          hint="Completadas, con error o canceladas"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Tokens este mes"
          value={formatTokens(totalTokens)}
          hint={`${deliverableCount} entregables · ${knowledgeCount} memorias`}
          icon={<Coins className="h-4 w-4" />}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="panel overflow-hidden">
          <SectionHeader
            title="Equipo"
            description="Estado sincronizado con el motor de ejecución."
            action={
              <Link href="/employees" className="text-[11px] text-zinc-500 transition hover:text-zinc-200">
                Ver todos
              </Link>
            }
          />

          {agents.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No hay empleados" description="Ejecuta el seed inicial para crear el equipo." />
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link
                    href={`/employees/${agent.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-white/[0.02]"
                  >
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border text-[10px] font-semibold"
                      style={{
                        borderColor: `${agent.department.color}40`,
                        backgroundColor: `${agent.department.color}12`,
                        color: agent.department.color,
                      }}
                    >
                      {initials(agent.name)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] text-zinc-200">{agent.name}</span>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${AGENT_STATUS_DOT[agent.status]}`} />
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-zinc-600">
                        {agent.role}
                        <span className="mx-1.5 text-zinc-700">·</span>
                        {agent.department.name}
                      </span>
                    </span>

                    <span className="hidden max-w-[42%] text-right sm:block">
                      {agent.currentSubtask ? (
                        <>
                          <span className="block truncate text-[11px] text-zinc-400">{agent.currentSubtask.title}</span>
                          <span className="block truncate text-[10px] text-zinc-600">{agent.currentSubtask.task.title}</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-zinc-600">{AGENT_STATUS_LABELS[agent.status]}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel overflow-hidden">
          <SectionHeader
            title="Actividad"
            description="Últimos movimientos de la oficina."
            action={
              <Link href="/activity" className="text-[11px] text-zinc-500 transition hover:text-zinc-200">
                Historial
              </Link>
            }
          />

          {activity.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Sin actividad" description="Las acciones aparecerán aquí." />
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {activity.map((entry) => (
                <li key={entry.id} className="flex gap-3 px-5 py-[11px]">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-zinc-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11.5px] leading-relaxed text-zinc-400">
                      <span className="text-zinc-200">
                        {entry.actorType === "ADMIN" ? "Director" : entry.actorType === "SYSTEM" ? "Sistema" : "Agente"}
                      </span>{" "}
                      {humanizeAction(entry.action)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-zinc-700">{timeAgo(entry.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <section className="panel overflow-hidden">
          <SectionHeader
            title="Próximas ejecuciones"
            description="Tareas programadas para una fecha futura."
            action={
              <Link href="/tasks" className="text-[11px] text-zinc-500 transition hover:text-zinc-200">
                Ver tareas
              </Link>
            }
          />

          {upcoming.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="No hay tareas programadas"
                description="Programa una tarea con fecha futura para verla aquí."
              />
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.04]">
              {upcoming.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="block truncate text-[12.5px] text-zinc-300 transition hover:text-white"
                    >
                      {task.title}
                    </Link>
                    <p className="mt-0.5 truncate text-[10.5px] text-zinc-600">
                      {task.assignments.map((assignment) => assignment.agent.name).join(", ") || "Sin asignar"}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10.5px] text-zinc-500">{formatDateTime(task.scheduledFor)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel overflow-hidden">
          <SectionHeader title="Tareas por estado" description={`${taskTotal} tareas registradas.`} />
          <ul className="space-y-3 px-5 py-4">
            {taskGroups.length === 0 ? (
              <li className="text-[12px] text-zinc-600">Sin tareas registradas.</li>
            ) : (
              taskGroups
                .slice()
                .sort((a, b) => b._count._all - a._count._all)
                .map((group) => {
                  const percent = taskTotal > 0 ? Math.round((group._count._all / taskTotal) * 100) : 0;
                  return (
                    <li key={group.status}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`chip ${TASK_STATUS_TONE[group.status]}`}>
                          {TASK_STATUS_LABELS[group.status]}
                        </span>
                        <span className="text-[11px] tabular-nums text-zinc-500">{group._count._all}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <div className="h-full rounded-full bg-zinc-600" style={{ width: `${percent}%` }} />
                      </div>
                    </li>
                  );
                })
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
