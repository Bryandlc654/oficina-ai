"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { KNOWLEDGE_KINDS, KNOWLEDGE_KIND_LABELS, type KnowledgeKindValue } from "@/lib/constants";
import { extractApiError } from "@/lib/client-error";
import { cn, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui";

type Entry = {
  id: string;
  kind: KnowledgeKindValue;
  category: string;
  title: string;
  content: string;
  tags: string[];
  isActive: boolean;
  updatedAt: string;
};

type Draft = {
  kind: KnowledgeKindValue;
  category: string;
  title: string;
  content: string;
  tags: string;
  isActive: boolean;
};

const EMPTY_DRAFT: Draft = {
  kind: "COMPANY",
  category: "",
  title: "",
  content: "",
  tags: "",
  isActive: true,
};

export function KnowledgeManager({ entries }: { entries: Entry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function startCreate() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setDraft({
      kind: entry.kind,
      category: entry.category,
      title: entry.title,
      content: entry.content,
      tags: entry.tags.join(", "),
      isActive: entry.isActive,
    });
    setError(null);
    setOpen(true);
  }

  function payload(): Record<string, unknown> {
    return {
      kind: draft.kind,
      category: draft.category,
      title: draft.title,
      content: draft.content,
      isActive: draft.isActive,
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12),
    };
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("save");
    setError(null);

    try {
      const response = await fetch(editingId ? `/api/knowledge/${editingId}` : "/api/knowledge", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(extractApiError(body));
        return;
      }

      setOpen(false);
      router.refresh();
    } catch {
      setError("No hay conexión con el servidor");
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(entry: Entry) {
    setBusy(entry.id);
    try {
      const response = await fetch(`/api/knowledge/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
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

  async function remove(entry: Entry) {
    if (!window.confirm(`¿Eliminar permanentemente "${entry.title}"? Esta acción no se puede deshacer.`)) return;

    setBusy(entry.id);
    setError(null);
    try {
      const response = await fetch(`/api/knowledge/${entry.id}`, { method: "DELETE" });
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/6 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Memoria empresarial</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Contexto compartido que el motor recupera de forma selectiva según cada tarea.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Nueva entrada
        </button>
      </div>

      {error ? (
        <p className="mx-5 mt-4 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {error}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="Sin conocimiento empresarial"
            description="Añade información de la empresa, servicios, productos, clientes, procedimientos u objetivos."
            action={
              <button type="button" className="btn-primary" onClick={startCreate}>
                <Plus className="h-4 w-4" />
                Crear entrada
              </button>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-white/5">
          {entries.map((entry) => (
            <li key={entry.id} className="px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip border-white/10 bg-white/[0.04] text-[10px] text-zinc-400">
                  {KNOWLEDGE_KIND_LABELS[entry.kind] ?? entry.kind}
                </span>
                <span className="text-[10px] text-zinc-600">{entry.category}</span>
                <span
                  className={cn(
                    "chip text-[10px]",
                    entry.isActive
                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                      : "border-zinc-700/40 bg-zinc-700/20 text-zinc-500",
                  )}
                >
                  {entry.isActive ? "Activa" : "Inactiva"}
                </span>
              </div>

              <div className="mt-1.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-200">{entry.title}</p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                    {entry.content}
                  </p>
                  {entry.tags.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="rounded border border-white/8 px-1.5 py-0.5 text-[9px] text-zinc-600">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <p className="mt-1.5 text-[10px] text-zinc-600">Actualizada {formatDateTime(entry.updatedAt)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleActive(entry)}
                    disabled={busy !== null}
                    className="rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-400 transition hover:text-white disabled:opacity-50"
                  >
                    {entry.isActive ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEdit(entry)}
                    disabled={busy !== null}
                    className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
                    aria-label={`Editar ${entry.title}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(entry)}
                    disabled={busy !== null}
                    className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
                    aria-label={`Eliminar ${entry.title}`}
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
          <div role="dialog" aria-modal="true" className="my-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-surface-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-sm font-semibold text-white">
                {editingId ? "Editar conocimiento" : "Nuevo conocimiento"}
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
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="knowledge-kind" className="label">
                    Tipo
                  </label>
                  <select
                    id="knowledge-kind"
                    className="input"
                    value={draft.kind}
                    onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as KnowledgeKindValue }))}
                  >
                    {KNOWLEDGE_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {KNOWLEDGE_KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="knowledge-category" className="label">
                    Categoría
                  </label>
                  <input
                    id="knowledge-category"
                    className="input"
                    value={draft.category}
                    onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
                    placeholder="Identidad, Operación, Clientes…"
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="knowledge-title" className="label">
                  Título
                </label>
                <input
                  id="knowledge-title"
                  className="input"
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  required
                  minLength={3}
                  maxLength={180}
                />
              </div>

              <div>
                <label htmlFor="knowledge-content" className="label">
                  Contenido
                </label>
                <textarea
                  id="knowledge-content"
                  className="input min-h-40 resize-y"
                  value={draft.content}
                  onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                  required
                  minLength={10}
                  maxLength={20000}
                />
              </div>

              <div>
                <label htmlFor="knowledge-tags" className="label">
                  Etiquetas (separadas por comas)
                </label>
                <input
                  id="knowledge-tags"
                  className="input"
                  value={draft.tags}
                  onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="marca, precios, onboarding"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-emerald-400"
                  checked={draft.isActive}
                  onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Activa (disponible para los agentes)
              </label>

              <div className="flex justify-end gap-2 border-t border-white/8 pt-4">
                <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={busy !== null}>
                  {busy === "save" ? "Guardando…" : editingId ? "Guardar cambios" : "Crear entrada"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
