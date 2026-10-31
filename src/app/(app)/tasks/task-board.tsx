"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  List,
  Plus,
  Search,
} from "lucide-react";
import {
  KANBAN_COLUMNS,
  TASK_PRIORITIES,
  TASK_PRIORITY_DOT,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_DOT,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/constants";
import { cn, formatDate, initials } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { NewTaskDialog } from "./new-task-dialog";

export type TaskCard = {
  id: string;
  title: string;
  objective: string;
  priority: TaskPriority;
  status: TaskStatus;
  scheduledFor: string | null;
  createdAt: string;
  department: { name: string; color: string } | null;
  project: { name: string } | null;
  assignees: { id: string; name: string }[];
  counts: { subtasks: number; deliverables: number };
};

export type AgentOption = { id: string; name: string; role: string; department: string };

type View = "kanban" | "list" | "calendar";

const VIEW_OPTIONS: { id: View; label: string; icon: typeof Columns3 }[] = [
  { id: "kanban", label: "Kanban", icon: Columns3 },
  { id: "list", label: "Lista", icon: List },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
];

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function TaskBoard({
  tasks,
  agents,
  departments,
  projects,
}: {
  tasks: TaskCard[];
  agents: AgentOption[];
  departments: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const [view, setView] = useState<View>("kanban");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "ALL">("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tasks.filter((task) => {
      if (priority !== "ALL" && task.priority !== priority) return false;
      if (!term) return true;
      return (
        task.title.toLowerCase().includes(term) ||
        task.objective.toLowerCase().includes(term) ||
        task.assignees.some((assignee) => assignee.name.toLowerCase().includes(term))
      );
    });
  }, [tasks, query, priority]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar tareas o responsables"
              className="input pl-9"
              aria-label="Buscar tareas"
            />
          </div>

          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as TaskPriority | "ALL")}
            className="input sm:w-44"
            aria-label="Filtrar por prioridad"
          >
            <option value="ALL">Todas las prioridades</option>
            {TASK_PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {TASK_PRIORITY_LABELS[item]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-white/[0.06] bg-white/[0.015] p-0.5">
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = view === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setView(option.id)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition",
                    active ? "bg-white/[0.07] text-zinc-100" : "text-zinc-600 hover:text-zinc-300",
                  )}
                  aria-pressed={active}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              );
            })}
          </div>

          <button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Nueva tarea
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={tasks.length === 0 ? "Todavía no hay tareas" : "Ningún resultado coincide"}
          description={
            tasks.length === 0
              ? "Crea la primera tarea con un objetivo concreto, prioridad y fecha de ejecución."
              : "Ajusta la búsqueda o el filtro de prioridad para encontrar la tarea."
          }
          action={
            tasks.length === 0 ? (
              <button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Crear tarea
              </button>
            ) : null
          }
        />
      ) : view === "kanban" ? (
        <KanbanView tasks={filtered} />
      ) : view === "list" ? (
        <ListView tasks={filtered} />
      ) : (
        <CalendarView tasks={filtered} />
      )}

      <NewTaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agents={agents}
        departments={departments}
        projects={projects}
      />
    </div>
  );
}

function TaskSubline({ task }: { task: TaskCard }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-zinc-600">
      {task.department ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.department.color }} />
          {task.department.name}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${TASK_PRIORITY_DOT[task.priority]}`} />
        {TASK_PRIORITY_LABELS[task.priority]}
      </span>
      {task.scheduledFor ? <span>{formatDate(task.scheduledFor)}</span> : null}
    </div>
  );
}

function KanbanView({ tasks }: { tasks: TaskCard[] }) {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
      {KANBAN_COLUMNS.map((status) => {
        const column = tasks.filter((task) => task.status === status);
        return (
          <section key={status} className="flex w-[272px] shrink-0 flex-col">
            <div className="mb-2 flex items-center justify-between px-1.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-400">
                <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_DOT[status]}`} />
                {TASK_STATUS_LABELS[status]}
              </span>
              <span className="text-[10px] tabular-nums text-zinc-600">{column.length}</span>
            </div>

            <div className="flex min-h-[140px] flex-col gap-2 rounded-xl border border-white/[0.035] bg-white/[0.012] p-1.5">
              {column.length === 0 ? (
                <p className="px-2 py-7 text-center text-[10px] text-zinc-700">Sin tareas</p>
              ) : (
                column.map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="rounded-lg border border-white/[0.055] bg-[#0a0e13] p-3 transition-colors hover:border-white/[0.13] hover:bg-[#0d1218]"
                  >
                    <p className="line-clamp-2 text-[12px] font-medium leading-snug text-zinc-200">{task.title}</p>
                    <TaskSubline task={task} />
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex -space-x-1.5">
                        {task.assignees.slice(0, 3).map((assignee) => (
                          <span
                            key={assignee.id}
                            title={assignee.name}
                            className="grid h-5 w-5 place-items-center rounded-full border border-[#0a0e13] bg-zinc-800 text-[8px] font-medium text-zinc-400"
                          >
                            {initials(assignee.name)}
                          </span>
                        ))}
                      </div>
                      <span className="text-[9.5px] text-zinc-700">
                        {task.counts.subtasks} subtareas · {task.counts.deliverables} entregables
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ListView({ tasks }: { tasks: TaskCard[] }) {
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[840px] text-[12px]">
          <thead>
            <tr className="table-head">
              <th className="px-5 py-2.5">Tarea</th>
              <th className="px-5 py-2.5">Estado</th>
              <th className="px-5 py-2.5">Prioridad</th>
              <th className="px-5 py-2.5">Responsables</th>
              <th className="px-5 py-2.5">Programada</th>
              <th className="px-5 py-2.5">Proyecto</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="table-row transition-colors hover:bg-white/[0.02]">
                <td className="px-5 py-3">
                  <Link href={`/tasks/${task.id}`} className="text-[12px] text-zinc-300 transition hover:text-white">
                    {task.title}
                  </Link>
                  <p className="mt-0.5 line-clamp-1 text-[10.5px] text-zinc-700">{task.objective}</p>
                </td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATUS_DOT[task.status]}`} />
                    {TASK_STATUS_LABELS[task.status]}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${TASK_PRIORITY_DOT[task.priority]}`} />
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </span>
                </td>
                <td className="px-5 py-3 text-[11px] text-zinc-500">
                  {task.assignees.map((assignee) => assignee.name).join(", ") || "Sin asignar"}
                </td>
                <td className="px-5 py-3 text-[11px] text-zinc-500">
                  {task.scheduledFor ? formatDate(task.scheduledFor) : "Inmediata"}
                </td>
                <td className="px-5 py-3 text-[11px] text-zinc-600">{task.project?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalendarView({ tasks }: { tasks: TaskCard[] }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const byDay = useMemo(() => {
    const map = new Map<string, TaskCard[]>();
    for (const task of tasks) {
      if (!task.scheduledFor) continue;
      const key = dayKey(new Date(task.scheduledFor));
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
    return map;
  }, [tasks]);

  const firstWeekday = (cursor.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(cursor.getFullYear(), cursor.getMonth(), index + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(cursor);
  const todayKey = dayKey(new Date());

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-medium capitalize text-zinc-200">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="rounded-md border border-white/[0.07] p-1.5 text-zinc-500 transition hover:text-white"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded-md border border-white/[0.07] px-2 py-1.5 text-[10.5px] text-zinc-500 transition hover:text-white"
            onClick={() => {
              const now = new Date();
              setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
          >
            Hoy
          </button>
          <button
            type="button"
            className="rounded-md border border-white/[0.07] p-1.5 text-zinc-500 transition hover:text-white"
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-white/[0.05] bg-white/[0.045]">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day) => (
          <div
            key={day}
            className="bg-[#0a0e13] px-2 py-1.5 text-center text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-600"
          >
            {day}
          </div>
        ))}
        {cells.map((date, index) => {
          if (!date) {
            return <div key={`empty-${index}`} className="min-h-[92px] bg-[#070a0e]" />;
          }
          const key = dayKey(date);
          const dayTasks = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <div key={key} className={cn("min-h-[92px] bg-[#0a0e13] p-1.5", isToday && "bg-emerald-500/[0.035]")}>
              <div className="mb-1 flex items-center justify-between px-0.5">
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full text-[10px]",
                    isToday ? "bg-emerald-400 font-medium text-emerald-950" : "text-zinc-600",
                  )}
                >
                  {date.getDate()}
                </span>
                {dayTasks.length > 0 ? <span className="text-[9px] text-zinc-700">{dayTasks.length}</span> : null}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 2).map((task) => (
                  <Link
                    key={task.id}
                    href={`/tasks/${task.id}`}
                    className="flex items-center gap-1.5 truncate rounded px-1 py-0.5 text-[10px] text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200"
                    title={task.title}
                  >
                    <span className={`h-1 w-1 shrink-0 rounded-full ${TASK_STATUS_DOT[task.status]}`} />
                    <span className="truncate">{task.title}</span>
                  </Link>
                ))}
                {dayTasks.length > 2 ? (
                  <p className="px-1 text-[9px] text-zinc-700">+{dayTasks.length - 2} más</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[10.5px] text-zinc-700">Solo se muestran tareas con fecha de ejecución programada.</p>
    </div>
  );
}
