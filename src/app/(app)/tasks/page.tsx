import { listTasks } from "@/lib/services/tasks";
import { listAssignableAgents } from "@/lib/services/agents";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { TaskBoard, type TaskCard } from "./task-board";
import type { TaskPriority, TaskStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tareas" };

export default async function TasksPage() {
  const [tasks, agents, departments, projects] = await Promise.all([
    listTasks(),
    listAssignableAgents(),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { order: "asc" } }),
    db.project.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
  ]);

  const cards: TaskCard[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    objective: task.objective,
    priority: task.priority as TaskPriority,
    status: task.status as TaskStatus,
    scheduledFor: task.scheduledFor?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    department: task.department ? { name: task.department.name, color: task.department.color } : null,
    project: task.project ? { name: task.project.name } : null,
    assignees: task.assignments.map((assignment) => ({
      id: assignment.agent.id,
      name: assignment.agent.name,
    })),
    counts: { subtasks: task._count.subtasks, deliverables: task._count.deliverables },
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Trabajo"
        title="Tareas"
        description="Objetivos asignados a la oficina. El Project Manager planifica, los especialistas ejecutan y el motor registra cada entregable."
      />

      <TaskBoard
        tasks={cards}
        agents={agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          role: agent.role,
          department: agent.department.name,
        }))}
        departments={departments}
        projects={projects}
      />
    </div>
  );
}
