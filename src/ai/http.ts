import { AIProviderError } from "./types";

const DEFAULT_TIMEOUT_MS = 90_000;

function providerMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;

  const error = record.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string") return message;
  }
  if (typeof error === "string") return error;
  if (typeof record.message === "string") return record.message;
  if (typeof record.detail === "string") return record.detail;
  return null;
}

function mapHttpError(status: number, payload: unknown, provider: string): AIProviderError {
  const detail = providerMessage(payload);
  const suffix = detail ? `: ${detail.slice(0, 400)}` : "";

  if (status === 401 || status === 403) {
    return new AIProviderError(
      `Clave de API inválida o sin permisos en ${provider}${suffix}`,
      "AUTH",
      { status, provider },
    );
  }
  if (status === 429) {
    return new AIProviderError(`Límite de cuota alcanzado en ${provider}${suffix}`, "RATE_LIMIT", {
      status,
      provider,
      retryable: true,
    });
  }
  if (status === 400 || status === 404 || status === 422) {
    return new AIProviderError(`Solicitud rechazada por ${provider}${suffix}`, "BAD_REQUEST", {
      status,
      provider,
    });
  }
  if (status >= 500) {
    return new AIProviderError(`Error interno de ${provider} (${status})${suffix}`, "SERVER", {
      status,
      provider,
      retryable: true,
    });
  }

  return new AIProviderError(`Error ${status} de ${provider}${suffix}`, "UNKNOWN", {
    status,
    provider,
  });
}

/**
 * Performs a JSON HTTP request with a hard timeout and normalized provider errors.
 * The URL is never echoed in error messages because it can contain API keys.
 */
export async function fetchJson(
  url: string,
  init: RequestInit,
  options: { provider: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();

  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeout);
      throw new AIProviderError("Ejecución cancelada", "CANCELLED", { provider: options.provider });
    }
    options.signal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    let payload: unknown = null;

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = raw;
      }
    }

    if (!response.ok) {
      throw mapHttpError(response.status, payload, options.provider);
    }

    return payload;
  } catch (error) {
    if (error instanceof AIProviderError) throw error;

    if ((error as Error).name === "AbortError") {
      if (options.signal?.aborted) {
        throw new AIProviderError("Ejecución cancelada", "CANCELLED", { provider: options.provider });
      }
      throw new AIProviderError(
        `${options.provider} no respondió en ${Math.round(timeoutMs / 1000)} s`,
        "TIMEOUT",
        { provider: options.provider, retryable: true },
      );
    }

    throw new AIProviderError(
      `No se pudo conectar con ${options.provider}: ${(error as Error).message}`,
      "SERVER",
      { provider: options.provider, retryable: true },
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", forwardAbort);
  }
}
