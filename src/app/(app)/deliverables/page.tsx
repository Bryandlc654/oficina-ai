import Link from "next/link";
import { db } from "@/lib/db";
import { DELIVERABLE_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { DownloadDeliverable } from "@/components/download-deliverable";
import { Markdown } from "@/components/markdown";
import { EmptyState, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entregables" };

export default async function DeliverablesPage() {
  const deliverables = await db.deliverable.findMany({
    include: {
      task: { select: { id: true, title: true } },
      agent: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Operación"
        title="Entregables"
        description="Resultados reales producidos por los agentes: documentos, informes, estrategias, análisis y código."
      />

      {deliverables.length === 0 ? (
        <EmptyState
          title="Sin entregables todavía"
          description="Cuando el motor multiaagente ejecute tareas, cada resultado quedará registrado aquí con su tarea, responsable y fecha."
        />
      ) : (
        <div className="space-y-3">
          {deliverables.map((deliverable) => (
            <article key={deliverable.id} className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip border-white/10 bg-white/[0.04] text-[10px] text-zinc-400">
                    {DELIVERABLE_TYPE_LABELS[deliverable.type] ?? deliverable.type}
                  </span>
                  <Link href={`/tasks/${deliverable.task.id}`} className="text-xs text-emerald-400 hover:text-emerald-300">
                    {deliverable.task.title}
                  </Link>
                </div>
                <h2 className="mt-1.5 text-sm font-semibold text-white">{deliverable.title}</h2>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {deliverable.agent.name} · {deliverable.agent.role} · {formatDateTime(deliverable.createdAt)}
                </p>
                {deliverable.content ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">Ver contenido</summary>
                    <div className="mt-2 max-h-80 overflow-auto rounded-lg border border-white/[0.06] bg-black/20 p-4">
                      <Markdown content={deliverable.content} />
                    </div>
                  </details>
                ) : null}
              </div>

              <div className="shrink-0">
                <DownloadDeliverable
                  title={deliverable.title}
                  content={deliverable.content}
                  fileUrl={deliverable.fileUrl}
                  fileName={deliverable.fileName}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
