"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus, X } from "lucide-react";
import { extractApiError } from "@/lib/client-error";
import { EmptyState } from "@/components/ui";

type Department = {
  id: string;
  name: string;
  description: string;
  color: string;
  agents: number;
  tasks: number;
};

export function DepartmentsGrid({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#34d399");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, color }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(extractApiError(payload));
        return;
      }

      setName("");
      setDescription("");
      setColor("#34d399");
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
          Nuevo departamento
        </button>
      </div>

      {departments.length === 0 ? (
        <EmptyState
          title="Sin departamentos"
          description="Crea la estructura organizativa de la oficina antes de incorporar empleados."
          action={
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" />
              Crear departamento
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((department) => (
            <div key={department.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl border"
                  style={{
                    borderColor: `${department.color}55`,
                    backgroundColor: `${department.color}18`,
                    color: department.color,
                  }}
                >
                  <Building2 className="h-4 w-4" />
                </span>
                <span className="chip border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">
                  {department.agents} empleados
                </span>
              </div>
              <h2 className="mt-3 text-sm font-semibold text-white">{department.name}</h2>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                {department.description || "Sin descripción."}
              </p>
              <p className="mt-3 border-t border-white/6 pt-3 text-[11px] text-zinc-600">
                {department.tasks} tareas vinculadas
              </p>
            </div>
          ))}
        </div>
      )}

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">Nuevo departamento</h2>
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
                <label htmlFor="department-name" className="label">
                  Nombre
                </label>
                <input
                  id="department-name"
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                />
              </div>

              <div>
                <label htmlFor="department-description" className="label">
                  Descripción
                </label>
                <textarea
                  id="department-description"
                  className="input min-h-20 resize-y"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={1000}
                  placeholder="Responsabilidad del área dentro de la oficina."
                />
              </div>

              <div>
                <label htmlFor="department-color" className="label">
                  Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="department-color"
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded border border-white/10 bg-transparent"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                  />
                  <span className="font-mono text-xs text-zinc-500">{color}</span>
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
                  {saving ? "Creando…" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
