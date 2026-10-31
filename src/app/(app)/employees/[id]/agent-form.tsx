"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2 } from "lucide-react";
import { AGENT_STATUSES, AGENT_STATUS_LABELS, type AgentStatusValue } from "@/lib/constants";

type ToolDraft = {
  name: string;
  description: string;
  isEnabled: boolean;
  requiresApproval: boolean;
};

type AgentDraft = {
  id: string;
  name: string;
  role: string;
  personality: string;
  responsibilities: string;
  systemPrompt: string;
  model: string;
  fallbackModel: string | null;
  maxIterations: number;
  dailyTokenLimit: number | null;
  status: AgentStatusValue;
  departmentId: string;
  providerId: string | null;
  fallbackProviderId: string | null;
  tools: ToolDraft[];
};

type ProviderOption = {
  id: string;
  name: string;
  type: string;
  isEnabled: boolean;
  hasKey: boolean;
};

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "No se pudo guardar";
  const error = (payload as { error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } } }).error;
  if (!error) return "No se pudo guardar";

  const fieldErrors = error.details?.fieldErrors;
  if (fieldErrors) {
    const first = Object.entries(fieldErrors).find(([, messages]) => messages.length > 0);
    if (first) {
      return `${first[0]}: ${first[1]?.[0] ?? "valor inválido"}`;
    }
  }

  return error.message ?? "No se pudo guardar";
}

export function AgentForm({
  agent,
  departments,
  providers,
}: {
  agent: AgentDraft;
  departments: { id: string; name: string }[];
  providers: ProviderOption[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<AgentDraft>(agent);
  const [tools, setTools] = useState<ToolDraft[]>(agent.tools);
  const [newTool, setNewTool] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function update<K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateTool(index: number, patch: Partial<ToolDraft>) {
    setTools((current) => current.map((tool, i) => (i === index ? { ...tool, ...patch } : tool)));
  }

  function addTool() {
    const name = newTool.name.trim();
    if (!name) return;
    if (tools.some((tool) => tool.name === name)) {
      setMessage({ kind: "error", text: "Ya existe una herramienta con ese nombre" });
      return;
    }
    setTools((current) => [
      ...current,
      { name, description: newTool.description.trim(), isEnabled: true, requiresApproval: false },
    ]);
    setNewTool({ name: "", description: "" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/agents/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          role: form.role,
          personality: form.personality,
          responsibilities: form.responsibilities,
          systemPrompt: form.systemPrompt,
          model: form.model,
          fallbackModel: form.fallbackModel || null,
          maxIterations: form.maxIterations,
          dailyTokenLimit: form.dailyTokenLimit,
          status: form.status,
          departmentId: form.departmentId,
          providerId: form.providerId,
          fallbackProviderId: form.fallbackProviderId,
          tools,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setMessage({ kind: "error", text: extractErrorMessage(payload) });
        return;
      }

      setMessage({ kind: "ok", text: "Cambios guardados" });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "No hay conexión con el servidor" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="panel p-5">
        <h2 className="text-sm font-semibold text-white">Identidad y puesto</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="agent-name" className="label">
              Nombre
            </label>
            <input
              id="agent-name"
              className="input"
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              required
              minLength={2}
            />
          </div>
          <div>
            <label htmlFor="agent-role" className="label">
              Cargo
            </label>
            <input
              id="agent-role"
              className="input"
              value={form.role}
              onChange={(event) => update("role", event.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="agent-department" className="label">
              Departamento
            </label>
            <select
              id="agent-department"
              className="input"
              value={form.departmentId}
              onChange={(event) => update("departmentId", event.target.value)}
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="agent-status" className="label">
              Estado de actividad
            </label>
            <select
              id="agent-status"
              className="input"
              value={form.status}
              onChange={(event) => update("status", event.target.value as AgentStatusValue)}
            >
              {AGENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {AGENT_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-zinc-600">
              El motor de ejecución actualiza este estado durante el trabajo real.
            </p>
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold text-white">Personalidad y responsabilidades</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="agent-personality" className="label">
              Personalidad profesional
            </label>
            <textarea
              id="agent-personality"
              className="input min-h-24 resize-y"
              value={form.personality}
              onChange={(event) => update("personality", event.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="agent-responsibilities" className="label">
              Responsabilidades
            </label>
            <textarea
              id="agent-responsibilities"
              className="input min-h-28 resize-y"
              value={form.responsibilities}
              onChange={(event) => update("responsibilities", event.target.value)}
              required
            />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">System prompt</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Instrucciones principales del empleado. Solo el administrador puede modificarlas.
            </p>
          </div>
          <span className="chip shrink-0 border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            Protegido
          </span>
        </div>
        <textarea
          id="agent-system-prompt"
          aria-label="System prompt"
          className="input mt-4 min-h-[340px] resize-y font-mono text-xs leading-relaxed"
          value={form.systemPrompt}
          onChange={(event) => update("systemPrompt", event.target.value)}
          required
          minLength={20}
        />
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold text-white">Modelo y límites</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="agent-provider" className="label">
              Proveedor principal
            </label>
            <select
              id="agent-provider"
              className="input"
              value={form.providerId ?? ""}
              onChange={(event) => update("providerId", event.target.value || null)}
            >
              <option value="">Sin asignar</option>
              {providers.map((provider) => {
                const ready = provider.isEnabled && (provider.type === "OLLAMA" || provider.hasKey);
                return (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                    {ready ? "" : " — pendiente de configurar"}
                  </option>
                );
              })}
            </select>
            <p className="mt-1.5 text-[11px] text-zinc-600">
              Si el proveedor no está operativo, el motor usará el alternativo o el predeterminado.
            </p>
          </div>

          <div>
            <label htmlFor="agent-fallback-provider" className="label">
              Proveedor alternativo
            </label>
            <select
              id="agent-fallback-provider"
              className="input"
              value={form.fallbackProviderId ?? ""}
              onChange={(event) => update("fallbackProviderId", event.target.value || null)}
            >
              <option value="">Sin asignar</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="agent-model" className="label">
              Modelo principal
            </label>
            <input
              id="agent-model"
              className="input font-mono text-xs"
              value={form.model}
              onChange={(event) => update("model", event.target.value)}
              required
            />
            <p className="mt-1.5 text-[11px] text-zinc-600">
              El identificador debe existir en el proveedor configurado.
            </p>
          </div>
          <div>
            <label htmlFor="agent-fallback" className="label">
              Modelo alternativo
            </label>
            <input
              id="agent-fallback"
              className="input font-mono text-xs"
              value={form.fallbackModel ?? ""}
              onChange={(event) => update("fallbackModel", event.target.value || null)}
              placeholder="opcional"
            />
          </div>
          <div>
            <label htmlFor="agent-iterations" className="label">
              Máximo de iteraciones por trabajo
            </label>
            <input
              id="agent-iterations"
              type="number"
              min={1}
              max={20}
              className="input"
              value={form.maxIterations}
              onChange={(event) => update("maxIterations", Number(event.target.value))}
            />
          </div>
          <div>
            <label htmlFor="agent-daily-limit" className="label">
              Límite diario de tokens
            </label>
            <input
              id="agent-daily-limit"
              type="number"
              min={1000}
              max={10_000_000}
              className="input"
              placeholder="Sin límite"
              value={form.dailyTokenLimit ?? ""}
              onChange={(event) =>
                update("dailyTokenLimit", event.target.value === "" ? null : Number(event.target.value))
              }
            />
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-sm font-semibold text-white">Herramientas autorizadas</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Solo las herramientas activas pueden usarse en ejecuciones. Las acciones sensibles requieren aprobación del director.
        </p>

        <div className="mt-4 space-y-2.5">
          {tools.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-xs text-zinc-500">
              Este empleado no tiene herramientas. Añade al menos una si necesita producir entregables.
            </p>
          ) : (
            tools.map((tool, index) => (
              <div key={`${tool.name}-${index}`} className="rounded-xl border border-white/8 bg-black/20 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs font-medium text-zinc-200">{tool.name}</p>
                    <input
                      aria-label={`Descripción de ${tool.name}`}
                      className="input mt-2 text-xs"
                      value={tool.description}
                      onChange={(event) => updateTool(index, { description: event.target.value })}
                      placeholder="Descripción de la herramienta"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setTools((current) => current.filter((_, i) => i !== index))}
                    className="rounded-lg p-1.5 text-zinc-600 transition hover:bg-rose-500/10 hover:text-rose-300"
                    aria-label={`Eliminar ${tool.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-4">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-emerald-400"
                      checked={tool.isEnabled}
                      onChange={(event) => updateTool(index, { isEnabled: event.target.checked })}
                    />
                    Habilitada
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-amber-400"
                      checked={tool.requiresApproval}
                      onChange={(event) => updateTool(index, { requiresApproval: event.target.checked })}
                    />
                    Requiere aprobación
                  </label>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 rounded-xl border border-dashed border-white/10 p-3.5">
          <p className="text-xs font-medium text-zinc-400">Añadir herramienta</p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <input
              aria-label="Nombre de la nueva herramienta"
              className="input font-mono text-xs"
              placeholder="namespace.action"
              value={newTool.name}
              onChange={(event) => setNewTool((current) => ({ ...current, name: event.target.value }))}
            />
            <input
              aria-label="Descripción de la nueva herramienta"
              className="input text-xs"
              placeholder="Qué hace y qué produce"
              value={newTool.description}
              onChange={(event) => setNewTool((current) => ({ ...current, description: event.target.value }))}
            />
            <button type="button" onClick={addTool} className="btn-secondary">
              <Plus className="h-4 w-4" />
              Añadir
            </button>
          </div>
        </div>
      </section>

      <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-xl border border-white/10 bg-surface-900/90 p-3 shadow-lg shadow-black/40 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
        <p
          className={
            message
              ? message.kind === "ok"
                ? "text-xs text-emerald-300"
                : "text-xs text-rose-300"
              : "text-xs text-zinc-500"
          }
        >
          {message?.text ?? "Los cambios se registran en el historial de actividad."}
        </p>
        <button type="submit" disabled={saving} className="btn-primary">
          <Save className="h-4 w-4" />
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
