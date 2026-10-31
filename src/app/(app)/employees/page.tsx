import Link from "next/link";
import { ArrowUpRight, Wrench } from "lucide-react";
import { listAgents } from "@/lib/services/agents";
import { AGENT_STATUS_DOT, AGENT_STATUS_LABELS } from "@/lib/constants";
import { initials } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empleados" };

export default async function EmployeesPage() {
  const agents = await listAgents();

  return (
    <div>
      <PageHeader
        eyebrow="Equipo"
        title="Empleados IA"
        description="Cada empleado tiene identidad, especialidad, system prompt editable, modelo asignado, herramientas autorizadas e historial propio."
      />

      {agents.length === 0 ? (
        <EmptyState
          title="No hay empleados"
          description="Ejecuta `npm run db:seed` para crear el equipo inicial de siete especialistas."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/employees/${agent.id}`}
              className="panel panel-hover group flex flex-col p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border text-[11px] font-medium"
                    style={{
                      borderColor: `${agent.department.color}35`,
                      backgroundColor: `${agent.department.color}10`,
                      color: agent.department.color,
                    }}
                  >
                    {initials(agent.name)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-[13px] font-medium text-zinc-100">{agent.name}</h2>
                    <p className="truncate text-[11px] text-zinc-600">{agent.role}</p>
                  </div>
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-zinc-700 transition group-hover:text-zinc-300" />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px]">
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <span className={`h-1.5 w-1.5 rounded-full ${AGENT_STATUS_DOT[agent.status]}`} />
                  {AGENT_STATUS_LABELS[agent.status]}
                </span>
                <span className="inline-flex items-center gap-1.5 text-zinc-500">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: agent.department.color }} />
                  {agent.department.name}
                </span>
              </div>

              <p className="mt-3 line-clamp-2 text-[11px] leading-relaxed text-zinc-600">{agent.personality}</p>

              <div className="mt-3 flex items-center justify-between border-t border-white/[0.04] pt-2.5 text-[10px] text-zinc-600">
                <span className="inline-flex items-center gap-1.5">
                  <Wrench className="h-3 w-3" />
                  {agent.tools.filter((tool) => tool.isEnabled).length} herramientas
                </span>
                <span>
                  {agent._count.runs} ejecuciones · {agent._count.deliverables} entregables
                </span>
              </div>

              <p className="mt-1.5 truncate font-mono text-[9.5px] text-zinc-700">{agent.model}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
