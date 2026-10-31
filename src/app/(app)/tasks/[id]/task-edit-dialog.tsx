"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { extractApiError } from "@/lib/client-error";

export function TaskEditDialog({
  task,
}: {
  task: {
    id: string;
    title: string;
    objective: string;
    description: string;
    priority: TaskPriority;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [objective, setObjective] = useState(task.objective);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, objective, description, priority }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(extractApiError(payload));
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Editar tarea
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:items-center">
          <div role="dialog" aria-modal="true" className="my-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Editar tarea</h2>
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
                <label htmlFor="edit-task-title" className="label">
                  Título
                </label>
                <input
                  id="edit-task-title"
                  className="input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  required
                  minLength={3}
                  maxLength={200}
                />
              </div>

              <div>
                <label htmlFor="edit-task-objective" className="label">
                  Objetivo
                </label>
                <textarea
                  id="edit-task-objective"
                  className="input min-h-24 resize-y"
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  required
                  minLength={10}
                  maxLength={5000}
                />
              </div>

              <div>
                <label htmlFor="edit-task-description" className="label">
                  Contexto y restricciones
                </label>
                <textarea
                  id="edit-task-description"
                  className="input min-h-20 resize-y"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={20000}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-task-priority" className="label">
                    Prioridad
                  </label>
                  <select
                    id="edit-task-priority"
                    className="input"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as TaskPriority)}
                  >
                    {TASK_PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {TASK_PRIORITY_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error ? (
                <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
              ) : null}

              <div className="flex justify-end gap-2 border-t border-white/8 pt-4">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
