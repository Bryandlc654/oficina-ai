import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { OfficeView } from "./office-view";
import type { OfficeAgent, OfficeDepartment } from "./types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Oficina 3D" };

export default async function OfficePage() {
  const [agents, departments] = await Promise.all([
    db.agent.findMany({
      include: {
        department: { select: { id: true, name: true, color: true, order: true } },
        currentSubtask: { select: { title: true, task: { select: { id: true, title: true } } } },
      },
      orderBy: [{ department: { order: "asc" } }, { name: "asc" }],
    }),
    db.department.findMany({
      select: { id: true, name: true, color: true, order: true },
      orderBy: { order: "asc" },
    }),
  ]);

  const officeAgents: OfficeAgent[] = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    status: agent.status,
    department: agent.department,
    currentTaskId: agent.currentSubtask?.task.id ?? null,
    currentTaskTitle: agent.currentSubtask?.task.title ?? null,
    currentSubtaskTitle: agent.currentSubtask?.title ?? null,
  }));

  const officeDepartments: OfficeDepartment[] = departments;

  return (
    <div>
      <PageHeader
        eyebrow="Oficina virtual"
        title="Oficina 3D"
        description="Oficina amplia con paredes y zona de descanso. Los empleados sin tarea descansan en la sala; al recibir trabajo caminan a su escritorio o a la mesa de reuniones."
        actions={
          <Link href="/employees" className="btn-secondary">
            Ver equipo
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        }
      />

      <OfficeView agents={officeAgents} departments={officeDepartments} />
    </div>
  );
}
