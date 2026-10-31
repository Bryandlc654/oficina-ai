"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { extractApiError } from "@/lib/client-error";
import { formatDateTime } from "@/lib/format";

type Memory = {
  id: string;
  title: string;
  content: string;
  importance: number;
  source: string | null;
  updatedAt: string;
};

const EMPTY = { title: "", content: "", importance: 2 };

// Where a lesson came from; see agent-learning.ts for how each one is recorded.
function memorySourceLabel(source: string | null): string {
  const kind = source?.split(":")[0];
  if (kind === "subtask") return "aprendido en tarea";
  if (kind === "review") return "control de calidad";
  if (kind === "director" || kind === "chat") return "indicación del director";
  return "escrita por ti";
}

export function AgentMemoryManager({ agentId, memories }: { agentId: string; memories: Memory[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setEditingId(null);
    setDraft(EMPTY);
    setError(null);
    setOpen(true);
  }

  function startEdit(memory: Memory) {
    setEditingId(memory.id);
    setDraft({ title: memory.title, content: memory.content, importance: memory.importance });
    setError(null);
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setError(null);

    try {
      const response = await fetch(
        editingId ? `/api/memories/${editingId}` : `/api/agents/${agentId}/memories`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(extractApiError(body));
        return;
      }

      setOpen(false);
      setDraft(EMPTY);
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor");
    } finally {
      setBusy(null);
    }
  }

  async function remove(memory: Memory) {
    if (!window.confirm(`¿Eliminar la memoria "${memory.title}"?`)) return;

    setBusy(memory.id);
    setError(null);
    try {
      const response = await fetch(`/api/memories/${memory.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(extractApiError(body));
        return;
      }
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <div className="flex items-center justify-between gap-3 border-b border-white/6 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold text-white">Memoria individual</h2>
          <p className="mt-0.5 text-[11px] text-zinc-500">Conocimiento, decisiones y aprendizajes de este empleado.</p>
        </div>
        <button type="button" onClick={startCreate} className="btn-secondary px-2.5 py-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Añadir
        </button>
      </div>

      {error ? (
        <p className="mx-5 mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
          {error}
        </p>
      ) : null}

      {memories.length === 0 ? (
        <p className="px-5 py-5 text-xs text-zinc-500">
          Sin entradas. Los agentes proponen aprendizajes al completar subtareas; aquí puedes revisarlos, editarlos o
          añadir conocimiento propio.
        </p>
      ) : (
        <ul className="divide-y divide-white/5">
          {memories.map((memory) => (
            <li key={memory.id} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-medium text-zinc-200">{memory.title}</p>
                    <span className="chip border-white/8 bg-white/[0.03] text-[9px] text-zinc-500">
                      {memorySourceLabel(memory.source)}
                    </span>
                    {memory.source !== "admin" ? (
                      <span className="text-[9px] text-zinc-600">importancia {memory.importance}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-500">{memory.content}</p>
                  <p className="mt-1 text-[10px] text-zinc-600">Actualizada {formatDateTime(memory.updatedAt)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(memory)}
                    disabled={busy !== null}
                    className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                    aria-label={`Editar ${memory.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(memory)}
                    disabled={busy !== null}
                    className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                    aria-label={`Eliminar ${memory.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:items-center">
          <div role="dialog" aria-modal="true" className="my-auto w-full max-w-lg rounded-2xl border border-white/10 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                {editingId ? "Editar memoria" : "Nueva memoria"}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={save} className="space-y-4 p-5">
              <div>
                <label htmlFor="memory-title" className="label">
                  Título
                </label>
                <input
                  id="memory-title"
                  className="input"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  required
                  minLength={3}
                  maxLength={180}
                />
              </div>

              <div>
                <label htmlFor="memory-content" className="label">
                  Contenido
                </label>
                <textarea
                  id="memory-content"
                  className="input min-h-32 resize-y"
                  value={draft.content}
                  onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                  required
                  minLength={10}
                  maxLength={10000}
                />
              </div>

              <div>
                <label htmlFor="memory-importance" className="label">
                  Importancia
                </label>
                <select
                  id="memory-importance"
                  className="input"
                  value={draft.importance}
                  onChange={(event) => setDraft((current) => ({ ...current, importance: Number(event.target.value) }))}
                >
                  {[1, 2, 3, 4, 5].map((level) => (
                    <option key={level} value={level}>
                      {level} · {level === 1 ? "baja" : level === 5 ? "crítica" : "media"}
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-[11px] text-zinc-600">
                La memoria no modifica el system prompt ni los permisos del empleado.
              </p>

              <div className="flex justify-end gap-2 border-t border-white/8 pt-4">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={busy !== null}>
                  {busy === "save" ? "Guardando…" : editingId ? "Guardar cambios" : "Crear memoria"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
