import { listDepartments } from "@/lib/services/organization";
import { PageHeader } from "@/components/ui";
import { DepartmentsGrid } from "./departments-grid";

export const dynamic = "force-dynamic";
export const metadata = { title: "Departamentos" };

export default async function DepartmentsPage() {
  const departments = await listDepartments();

  return (
    <div>
      <PageHeader
        eyebrow="Equipo"
        title="Departamentos"
        description="Áreas de la oficina que agrupan empleados y tareas. Los departamentos organizan la asignación de trabajo."
      />

      <DepartmentsGrid
        departments={departments.map((department) => ({
          id: department.id,
          name: department.name,
          description: department.description,
          color: department.color,
          agents: department._count.agents,
          tasks: department._count.tasks,
        }))}
      />
    </div>
  );
}
