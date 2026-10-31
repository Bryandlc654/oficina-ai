import { db } from "@/lib/db";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { formatNumber, formatTokens } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consumo" };

export default async function UsagePage() {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [byAgent, byProvider, totals, agents, providers] = await Promise.all([
    db.aIUsage.groupBy({
      by: ["agentId"],
      where: { createdAt: { gte: startOfMonth } },
      _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    db.aIUsage.groupBy({
      by: ["providerId"],
      where: { createdAt: { gte: startOfMonth } },
      _sum: { totalTokens: true },
    }),
    db.aIUsage.aggregate({
      where: { createdAt: { gte: startOfMonth } },
      _sum: { totalTokens: true, inputTokens: true, outputTokens: true },
      _count: { _all: true },
    }),
    db.agent.findMany({ select: { id: true, name: true, role: true, dailyTokenLimit: true } }),
    db.aIProvider.findMany({ select: { id: true, name: true } }),
  ]);

  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const providerMap = new Map(providers.map((provider) => [provider.id, provider.name]));
  const rows = byAgent
    .map((row) => ({
      ...row,
      agent: agentMap.get(row.agentId),
    }))
    .sort((a, b) => (b._sum.totalTokens ?? 0) - (a._sum.totalTokens ?? 0));

  return (
    <div>
      <PageHeader
        eyebrow="Sistema"
        title="Estadísticas de consumo"
        description="Uso real de tokens registrado por el motor. Los datos se actualizan con cada ejecución de agente."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Tokens este mes" value={formatTokens(totals._sum.totalTokens ?? 0)} hint="entrada + salida" />
        <StatCard label="Tokens de entrada" value={formatTokens(totals._sum.inputTokens ?? 0)} />
        <StatCard label="Llamadas registradas" value={formatNumber(totals._count._all)} hint="mes en curso" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-white/6 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Consumo por empleado</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Mes en curso.</p>
          </div>

          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Sin consumo registrado"
                description="Se registrarán tokens de entrada y salida por empleado, modelo y proveedor cuando el motor ejecute agentes."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="table-head">
                    <th className="px-5 py-3">Empleado</th>
                    <th className="px-5 py-3">Llamadas</th>
                    <th className="px-5 py-3">Entrada</th>
                    <th className="px-5 py-3">Salida</th>
                    <th className="px-5 py-3">Total</th>
                    <th className="px-5 py-3">Límite diario</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.agentId} className="table-row">
                      <td className="px-5 py-3">
                        <p className="text-xs font-medium text-zinc-200">{row.agent?.name ?? "Agente eliminado"}</p>
                        <p className="text-[10px] text-zinc-600">{row.agent?.role ?? "—"}</p>
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-400">{formatNumber(row._count._all)}</td>
                      <td className="px-5 py-3 text-xs text-zinc-400">{formatNumber(row._sum.inputTokens ?? 0)}</td>
                      <td className="px-5 py-3 text-xs text-zinc-400">{formatNumber(row._sum.outputTokens ?? 0)}</td>
                      <td className="px-5 py-3 text-xs font-medium text-zinc-200">
                        {formatNumber(row._sum.totalTokens ?? 0)}
                      </td>
                      <td className="px-5 py-3 text-xs text-zinc-500">
                        {row.agent?.dailyTokenLimit ? formatNumber(row.agent.dailyTokenLimit) : "Sin límite"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="text-sm font-semibold text-white">Por proveedor</h2>
          {byProvider.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-500">Sin datos.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {byProvider.map((row) => (
                <li key={row.providerId} className="flex items-center justify-between gap-2 rounded-lg border border-white/6 bg-black/20 px-3 py-2">
                  <span className="truncate text-xs text-zinc-300">{providerMap.get(row.providerId) ?? "Proveedor"}</span>
                  <span className="shrink-0 text-xs text-zinc-400">{formatTokens(row._sum.totalTokens ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-5 border-t border-white/6 pt-3 text-[11px] leading-relaxed text-zinc-600">
            Los límites diarios y las cuotas de proveedor se aplican en el AI Provider Manager (fase 2). No se realizan
            cargos automáticos en APIs de pago.
          </p>
        </section>
      </div>
    </div>
  );
}
