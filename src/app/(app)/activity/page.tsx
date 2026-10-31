import { db } from "@/lib/db";
import { formatDateTime, humanizeAction } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Actividad" };

const ACTOR_LABELS: Record<string, string> = {
  ADMIN: "Director",
  SYSTEM: "Sistema",
  AGENT: "Agente",
};

export default async function ActivityPage() {
  const [logs, agents] = await Promise.all([
    db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 150 }),
    db.agent.findMany({ select: { id: true, name: true } }),
  ]);

  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

  return (
    <div>
      <PageHeader
        eyebrow="Sistema"
        title="Actividad e historial"
        description="Registro de acciones del director, del sistema y de los agentes. Cada operación relevante queda auditada."
      />

      {logs.length === 0 ? (
        <EmptyState
          title="Sin actividad registrada"
          description="Las acciones de la oficina aparecerán aquí a medida que se utilice el sistema."
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="table-head">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Entidad</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const actor =
                    log.actorType === "AGENT" && log.actorId
                      ? (agentNames.get(log.actorId) ?? "Agente")
                      : (ACTOR_LABELS[log.actorType] ?? log.actorType);

                  return (
                    <tr key={log.id} className="table-row">
                      <td className="whitespace-nowrap px-4 py-3 text-[11px] text-zinc-500">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-300">{actor}</td>
                      <td className="px-4 py-3 text-xs text-zinc-300">{humanizeAction(log.action)}</td>
                      <td className="px-4 py-3 text-[11px] text-zinc-500">
                        {log.entityType}
                        {log.entityId ? <span className="text-zinc-600"> · {log.entityId.slice(0, 10)}…</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        {log.metadata ? (
                          <details>
                            <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">Ver</summary>
                            <pre className="mt-1 max-w-md overflow-auto whitespace-pre-wrap rounded border border-white/6 bg-black/30 p-2 text-[10px] text-zinc-500">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="text-[11px] text-zinc-600">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
