"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function QualitySettings({
  initial,
}: {
  initial: { qualityMinScore: number; autoApprove: boolean; maxTaskTokens: number };
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "No se pudo guardar");
      }
      setMessage({ text: "Guardado", ok: true });
      router.refresh();
    } catch (error) {
      setMessage({ text: (error as Error).message, ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <label className="block">
        <span className="flex items-center justify-between text-xs text-zinc-400">
          Nota mínima de Control de calidad
          <span className="font-medium text-zinc-200">{form.qualityMinScore}/10</span>
        </span>
        <input
          type="range"
          min={1}
          max={10}
          value={form.qualityMinScore}
          onChange={(event) => setForm({ ...form, qualityMinScore: Number(event.target.value) })}
          className="mt-2 w-full accent-emerald-400"
        />
        <span className="mt-1 block text-[11px] text-zinc-600">
          Por debajo de esta nota el trabajo vuelve al equipo para corregirse (una ronda) antes de entregarse.
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-lg border border-white/6 bg-black/20 px-3 py-2.5">
        <input
          type="checkbox"
          checked={form.autoApprove}
          onChange={(event) => setForm({ ...form, autoApprove: event.target.checked })}
          className="mt-0.5 accent-emerald-400"
        />
        <span>
          <span className="block text-xs text-zinc-300">Entrega automática</span>
          <span className="block text-[11px] text-zinc-600">
            Si el trabajo alcanza la nota mínima, se completa sin esperar tu aprobación. Si no la alcanza, siempre queda
            pendiente de ti.
          </span>
        </span>
      </label>

      <label className="block">
        <span className="text-xs text-zinc-400">Presupuesto de tokens por tarea</span>
        <input
          type="number"
          min={0}
          step={10000}
          value={form.maxTaskTokens}
          onChange={(event) => setForm({ ...form, maxTaskTokens: Math.max(0, Number(event.target.value) || 0) })}
          className="input mt-2"
        />
        <span className="mt-1 block text-[11px] text-zinc-600">
          La tarea se detiene con aviso al llegar a este consumo. 0 = sin límite.
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={saving} className="btn-primary">
          {saving ? "Guardando…" : "Guardar"}
        </button>
        {message ? (
          <span className={message.ok ? "text-xs text-emerald-300" : "text-xs text-rose-300"}>{message.text}</span>
        ) : null}
      </div>
    </div>
  );
}
