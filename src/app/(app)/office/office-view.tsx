"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Users } from "lucide-react";
import { AGENT_STATUS_DOT, AGENT_STATUS_LABELS } from "@/lib/constants";
import { cn, initials } from "@/lib/format";
import type { OfficeAgent, OfficeDepartment } from "./types";

const OfficeCanvas = dynamic(() => import("./office-canvas").then((module) => module.OfficeCanvas), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-surface-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400" />
        <p className="text-xs text-zinc-500">Cargando oficina…</p>
      </div>
    </div>
  ),
});

export function OfficeView({
  agents,
  departments,
}: {
  agents: OfficeAgent[];
  departments: OfficeDepartment[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = agents.find((agent) => agent.id === selectedId) ?? null;

  const working = agents.filter((agent) => agent.status === "WORKING").length;
  const available = agents.filter((agent) => agent.status === "AVAILABLE").length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/[0.05] px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {departments.map((department) => (
              <span key={department.id} className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: department.color }} />
                <span className="text-[10px] text-zinc-500">{department.name}</span>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <span>
              <span className="text-zinc-400">{working}</span> trabajando
            </span>
            <span>
              <span className="text-zinc-400">{available}</span> disponibles
            </span>
            <span className="hidden sm:inline">Arrastra para rotar · clic para seleccionar</span>
          </div>
        </div>

        <div className="relative h-[520px] sm:h-[580px] xl:h-[640px]">
          <OfficeCanvas
            agents={agents}
            departments={departments}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>
      </section>

      <aside className="space-y-4">
        {selected ? (
          <div className="panel p-5">
            <div className="flex items-start gap-3">
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border text-sm font-semibold"
                style={{
                  borderColor: `${selected.department.color}55`,
                  backgroundColor: `${selected.department.color}18`,
                  color: selected.department.color,
                }}
              >
                {initials(selected.name)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-white">{selected.name}</h2>
                <p className="truncate text-xs text-zinc-500">{selected.role}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-500 hover:text-white"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip border-white/10 bg-white/[0.03] text-[10px] text-zinc-300">
                <span className={cn("h-1.5 w-1.5 rounded-full", AGENT_STATUS_DOT[selected.status])} />
                {AGENT_STATUS_LABELS[selected.status]}
              </span>
              <span
                className="chip border text-[10px]"
                style={{
                  borderColor: `${selected.department.color}40`,
                  backgroundColor: `${selected.department.color}12`,
                  color: selected.department.color,
                }}
              >
                {selected.department.name}
              </span>
            </div>

            <div className="mt-4 rounded-xl border border-white/6 bg-black/20 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">Trabajo actual</p>
              {selected.currentTaskId ? (
                <>
                  <Link
                    href={`/tasks/${selected.currentTaskId}`}
                    className="mt-1 block text-xs font-medium text-zinc-200 hover:text-white"
                  >
                    {selected.currentTaskTitle}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{selected.currentSubtaskTitle}</p>
                </>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">
                  {selected.status === "AVAILABLE"
                    ? "Descansando en la sala, sin tarea activa."
                    : "Sin subtarea activa."}
                </p>
              )}
            </div>

            <Link href={`/employees/${selected.id}`} className="btn-secondary mt-4 w-full">
              Ver ficha completa
            </Link>
          </div>
        ) : (
          <div className="panel p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-400/80" />
              <h2 className="text-sm font-semibold text-white">Equipo en la oficina</h2>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              Selecciona un personaje o un escritorio para ver su estado, la tarea que está ejecutando y su historial.
            </p>
            <ul className="mt-4 space-y-1.5">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(agent.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-white/6 bg-black/20 px-2.5 py-2 text-left transition hover:border-white/15"
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", AGENT_STATUS_DOT[agent.status])} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-zinc-200">{agent.name}</span>
                      <span className="block truncate text-[10px] text-zinc-600">
                        {agent.currentSubtaskTitle
                          ? `Trabajando · ${agent.currentSubtaskTitle}`
                          : agent.status === "AVAILABLE"
                            ? "Descansando"
                            : AGENT_STATUS_LABELS[agent.status]}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="panel p-4 text-[11px] leading-relaxed text-zinc-600">
          La escena es deliberadamente ligera: sin sombras dinámicas ni postprocesado. Los personajes
          caminan y se reúnen solo cuando el motor registra actividad real.
        </div>
      </aside>
    </div>
  );
}
