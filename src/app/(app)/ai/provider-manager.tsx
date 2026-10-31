"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, Loader2, Star, Trash2 } from "lucide-react";
import { extractApiError } from "@/lib/client-error";
import { cn, formatDateTime } from "@/lib/format";

type Provider = {
  id: string;
  name: string;
  type: string;
  baseUrl: string | null;
  models: string[];
  isEnabled: boolean;
  isDefault: boolean;
  hasKey: boolean;
  hasEnvKey: boolean;
  updatedAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  GEMINI: "Google Gemini",
  GROQ: "Groq",
  OLLAMA: "Ollama · local",
  OPENROUTER: "OpenRouter · API compatible",
};

export function ProviderManager({ providers }: { providers: Provider[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {providers.map((provider) => (
        <ProviderCard key={provider.id} provider={provider} />
      ))}
    </div>
  );
}

function ProviderCard({ provider }: { provider: Provider }) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const isOllama = provider.type === "OLLAMA";
  const ready = provider.isEnabled && (isOllama || provider.hasKey || provider.hasEnvKey);

  async function patch(body: Record<string, unknown>, action: string): Promise<boolean> {
    setBusy(action);
    setMessage(null);

    try {
      const response = await fetch(`/api/providers/${provider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setMessage({ kind: "error", text: extractApiError(payload) });
        return false;
      }

      router.refresh();
      return true;
    } catch {
      setMessage({ kind: "error", text: "No hay conexión con el servidor" });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function saveCredentials() {
    const payload: Record<string, unknown> = { baseUrl: baseUrl.trim() || null };
    if (!isOllama && apiKey.trim()) payload.apiKey = apiKey.trim();

    const ok = await patch(payload, "save");
    if (ok) {
      setApiKey("");
      setMessage({ kind: "ok", text: "Configuración guardada" });
    }
  }

  async function removeKey() {
    if (!window.confirm(`¿Eliminar la clave de ${provider.name}? El proveedor dejará de poder usarse.`)) return;
    const ok = await patch({ apiKey: "" }, "remove");
    if (ok) setMessage({ kind: "ok", text: "Clave eliminada" });
  }

  async function toggleEnabled() {
    const ok = await patch({ isEnabled: !provider.isEnabled }, "toggle");
    if (ok) setMessage({ kind: "ok", text: provider.isEnabled ? "Proveedor deshabilitado" : "Proveedor habilitado" });
  }

  async function makeDefault() {
    const ok = await patch({ isDefault: true }, "default");
    if (ok) setMessage({ kind: "ok", text: "Proveedor predeterminado actualizado" });
  }

  return (
    <article className="panel flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">{provider.name}</h2>
          <p className="mt-0.5 text-[11px] text-zinc-600">{TYPE_LABELS[provider.type] ?? provider.type}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {provider.isDefault ? (
            <span className="chip border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">
              <Star className="h-2.5 w-2.5" /> Predeterminado
            </span>
          ) : null}
          <span
            className={cn(
              "chip text-[10px]",
              ready
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : provider.isEnabled
                  ? "border-amber-500/25 bg-amber-500/10 text-amber-300"
                  : "border-white/10 bg-white/[0.03] text-zinc-500",
            )}
          >
            {ready ? "Operativo" : provider.isEnabled ? "Incompleto" : "Deshabilitado"}
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor={`key-${provider.id}`} className="label">
            Clave de API
          </label>
          {isOllama ? (
            <p className="rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-xs text-zinc-500">
              Ollama es local y no requiere clave.
            </p>
          ) : (
            <div className="flex gap-2">
              <input
                id={`key-${provider.id}`}
                type="password"
                autoComplete="new-password"
                className="input font-mono text-xs"
                placeholder={
                  provider.hasKey
                    ? "Clave guardada · escribe para reemplazar"
                    : provider.hasEnvKey
                      ? "OPENROUTER_API_KEY del entorno · escribe para reemplazar"
                      : "Pega la API key"
                }
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <button
                type="button"
                onClick={saveCredentials}
                disabled={busy !== null}
                className="btn-secondary shrink-0 px-2.5"
                aria-label="Guardar clave"
                title="Guardar clave"
              >
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              </button>
            </div>
          )}
          {provider.hasEnvKey && !provider.hasKey ? (
            <p className="mt-1.5 text-[10.5px] text-emerald-300/80">
              Usando la clave del entorno. Puedes guardar otra clave aquí para reemplazarla.
            </p>
          ) : null}
          {provider.hasKey && !isOllama ? (
            <button
              type="button"
              onClick={removeKey}
              disabled={busy !== null}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-zinc-600 transition hover:text-rose-300"
            >
              <Trash2 className="h-3 w-3" />
              Eliminar clave guardada
            </button>
          ) : null}
        </div>

        <div>
          <label htmlFor={`url-${provider.id}`} className="label">
            URL base
          </label>
          <div className="flex gap-2">
            <input
              id={`url-${provider.id}`}
              className="input font-mono text-[11px]"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://…"
            />
            <button
              type="button"
              onClick={saveCredentials}
              disabled={busy !== null}
              className="btn-secondary shrink-0 px-2.5"
              aria-label="Guardar URL"
              title="Guardar URL"
            >
              {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {provider.models.length === 0 ? (
            <span className="text-[11px] text-zinc-600">Sin modelos declarados</span>
          ) : (
            provider.models.map((model) => (
              <span key={model} className="rounded border border-white/8 bg-black/25 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                {model}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-white/[0.05] pt-3">
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={busy !== null}
          className={provider.isEnabled ? "btn-secondary text-xs" : "btn-primary text-xs"}
        >
          {busy === "toggle" ? "Guardando…" : provider.isEnabled ? "Deshabilitar" : "Habilitar"}
        </button>

        {!provider.isDefault ? (
          <button type="button" onClick={makeDefault} disabled={busy !== null} className="btn-secondary text-xs">
            <Star className="h-3.5 w-3.5" />
            Usar por defecto
          </button>
        ) : null}
      </div>

      {message ? (
        <p className={message.kind === "ok" ? "mt-2 text-[11px] text-emerald-300" : "mt-2 text-[11px] text-rose-300"}>
          {message.text}
        </p>
      ) : null}

      <p className="mt-3 text-[10px] text-zinc-600">Actualizado {formatDateTime(provider.updatedAt)}</p>
    </article>
  );
}
