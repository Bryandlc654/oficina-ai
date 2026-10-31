"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from "@/lib/constants";
import { extractApiError } from "@/lib/client-error";
import type { AgentOption } from "./task-board";

export function NewTaskDialog({
  open,
  onClose,
  agents,
  departments,
  projects,
}: {
  open: boolean;
  onClose: () => void;
  agents: AgentOption[];
  departments: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("MEDIUM");
  const [scheduledFor, setScheduledFor] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function toggleAgent(id: string) {
    setAgentIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function reset() {
    setTitle("");
    setObjective("");
    setDescription("");
    setPriority("MEDIUM");
    setScheduledFor("");
    setDepartmentId("");
    setProjectId("");
    setAgentIds([]);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          objective,
          description,
          priority,
          scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
          departmentId: departmentId || null,
          projectId: projectId || null,
          agentIds,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(extractApiError(payload));
        return;
      }

      reset();
      onClose();
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-task-title"
        className="my-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-surface-900 shadow-2xl shadow-black/60"
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 id="new-task-title" className="text-sm font-semibold text-white">
              Nueva tarea
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              El Project Manager analizará el objetivo y generará el plan en la fase 2.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <div>
            <label htmlFor="task-title" className="label">
              Título
            </label>
            <input
              id="task-title"
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Campaña de lanzamiento del nuevo servicio"
              required
              minLength={3}
              maxLength={200}
            />
          </div>

          <div>
            <label htmlFor="task-objective" className="label">
              Objetivo
            </label>
            <textarea
              id="task-objective"
              className="input min-h-24 resize-y"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Qué debe conseguir la oficina y cómo se medirá el éxito."
              required
              minLength={10}
              maxLength={5000}
            />
          </div>

          <div>
            <label htmlFor="task-description" className="label">
              Contexto y restricciones
            </label>
            <textarea
              id="task-description"
              className="input min-h-20 resize-y"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Información adicional, audiencia, tono, límites, enlaces de referencia…"
              maxLength={20000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="task-priority" className="label">
                Prioridad
              </label>
              <select
                id="task-priority"
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

            <div>
              <label htmlFor="task-schedule" className="label">
                Fecha de ejecución
              </label>
              <input
                id="task-schedule"
                type="datetime-local"
                className="input"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
              />
              <p className="mt-1 text-[11px] text-zinc-600">Vacío = ejecución inmediata.</p>
            </div>

            <div>
              <label htmlFor="task-department" className="label">
                Departamento
              </label>
              <select
                id="task-department"
                className="input"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">Sin departamento</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="task-project" className="label">
                Proyecto
              </label>
              <select
                id="task-project"
                className="input"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">Sin proyecto</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <span className="label">Empleados asignados</span>
            {agents.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-xs text-zinc-500">
                No hay empleados disponibles. Ejecuta el seed inicial.
              </p>
            ) : (
              <div className="grid max-h-44 gap-1.5 overflow-y-auto rounded-lg border border-white/8 bg-black/20 p-2 sm:grid-cols-2">
                {agents.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-xs transition hover:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-emerald-400"
                      checked={agentIds.includes(agent.id)}
                      onChange={() => toggleAgent(agent.id)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-zinc-200">{agent.name}</span>
                      <span className="block truncate text-[10px] text-zinc-600">
                        {agent.role} · {agent.department}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="mt-1 text-[11px] text-zinc-600">
              Si no asignas empleados, el Project Manager propondrá el equipo al planificar.
            </p>
          </div>

          {error ? (
            <p className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-white/8 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Creando…" : "Crear tarea"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
