import { listProjects } from "@/lib/services/organization";
import { PageHeader } from "@/components/ui";
import { ProjectsList } from "./projects-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proyectos" };

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Proyectos"
        description="Agrupaciones de tareas con un objetivo común, fechas y estado de avance."
      />

      <ProjectsList
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          description: project.description,
          objective: project.objective,
          status: project.status,
          dueDate: project.dueDate?.toISOString() ?? null,
          createdAt: project.createdAt.toISOString(),
          taskCount: project._count.tasks,
          completedTasks: project.tasks.filter((task) => task.status === "COMPLETED").length,
        }))}
      />
    </div>
  );
}
