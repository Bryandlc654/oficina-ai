"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus, X } from "lucide-react";
import { PROJECT_STATUS_LABELS } from "@/lib/constants";
import { extractApiError } from "@/lib/client-error";
import { EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";

type Project = {
  id: string;
  name: string;
  description: string;
  objective: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  taskCount: number;
  completedTasks: number;
};

export function ProjectsList({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          objective,
          description,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(extractApiError(payload));
        return;
      }

      setName("");
      setObjective("");
      setDescription("");
      setDueDate("");
      setOpen(false);
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo proyecto
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="Sin proyectos"
          description="Crea un proyecto para agrupar tareas relacionadas y seguir su avance."
          action={
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Crear proyecto
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const progress = project.taskCount > 0 ? Math.round((project.completedTasks / project.taskCount) * 100) : 0;
            return (
              <article key={project.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
                    <FolderKanban className="h-4 w-4" />
                  </span>
                  <span className="chip border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">
                    {PROJECT_STATUS_LABELS[project.status] ?? project.status}
                  </span>
                </div>

                <h2 className="mt-3 text-sm font-semibold text-white">{project.name}</h2>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                  {project.description || project.objective}
                </p>

                <div className="mt-4">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>
                      {project.completedTasks}/{project.taskCount} tareas completadas
                    </span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-emerald-400/60" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                <p className="mt-3 border-t border-white/6 pt-3 text-[11px] text-zinc-600">
                  Vence: {project.dueDate ? formatDate(project.dueDate) : "sin fecha"}
                </p>
              </article>
            );
          })}
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:items-center">
          <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Nuevo proyecto</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-4 p-5">
              <div>
                <label htmlFor="project-name" className="label">
                  Nombre
                </label>
                <input
                  id="project-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                />
              </div>

              <div>
                <label htmlFor="project-objective" className="label">
                  Objetivo
                </label>
                <textarea
                  id="project-objective"
                  className="input min-h-20 resize-y"
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  required
                  minLength={10}
                  maxLength={5000}
                />
              </div>

              <div>
                <label htmlFor="project-description" className="label">
                  Descripción
                </label>
                <textarea
                  id="project-description"
                  className="input min-h-16 resize-y"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={10000}
                />
              </div>

              <div>
                <label htmlFor="project-due" className="label">
                  Fecha límite
                </label>
                <input
                  id="project-due"
                  type="date"
                  className="input"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              {error ? (
                <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-white/8 pt-4">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Creando…" : "Crear proyecto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
