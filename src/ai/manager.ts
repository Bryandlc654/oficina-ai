import type { AIProvider, Agent } from "@prisma/client";
import { db } from "../lib/db";
import { decryptSecret } from "../lib/crypto";
import { getOfficeSettings } from "../lib/services/organization";
import { getOpenRouterApiKey } from "./openrouter-env";
import { getAdapter } from "./providers";
import {
  AIProviderError,
  type AIProviderKind,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type ProviderConfig,
} from "./types";

type ProviderRow = AIProvider;
type AgentWithProviders = Agent & {
  provider: ProviderRow | null;
  fallbackProvider: ProviderRow | null;
};

export type CompletionInput = {
  agentId: string;
  /** Null for work outside a task, such as office chat replies. */
  taskId: string | null;
  subtaskId?: string | null;
  runId?: string | null;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
  responseFormat?: "text" | "json";
  signal?: AbortSignal;
};

type Candidate = {
  provider: ProviderRow;
  model: string;
};

type Resolution = {
  candidates: Candidate[];
  reasons: string[];
};

function modelsOf(provider: ProviderRow): string[] {
  if (!Array.isArray(provider.models)) return [];
  return provider.models.filter((model): model is string => typeof model === "string");
}

function isConfigured(provider: ProviderRow): boolean {
  if (provider.type === "OLLAMA") return true;
  if (provider.apiKeyCipher) return true;
  if (provider.type === "OPENROUTER") return Boolean(getOpenRouterApiKey());
  return false;
}

function buildCandidates(agent: AgentWithProviders, enabledProviders: ProviderRow[]): Resolution {
  const candidates: Candidate[] = [];
  const reasons: string[] = [];
  const defaultProvider = enabledProviders.find((provider) => provider.isDefault) ?? null;

  const add = (provider: ProviderRow | null, model: string | undefined, label: string) => {
    if (!provider) return;
    if (!provider.isEnabled) {
      reasons.push(`${provider.name} (${label}) está deshabilitado`);
      return;
    }
    if (!isConfigured(provider)) {
      reasons.push(`${provider.name} (${label}) no tiene clave de API`);
      return;
    }
    if (!model) {
      reasons.push(`${provider.name} (${label}) no tiene modelo asignado`);
      return;
    }
    if (!candidates.some((candidate) => candidate.provider.id === provider.id && candidate.model === model)) {
      candidates.push({ provider, model });
    }
  };

  add(agent.provider, agent.model, "principal");
  add(agent.fallbackProvider, agent.fallbackModel ?? agent.model, "alternativo");
  add(defaultProvider, defaultProvider ? (modelsOf(defaultProvider)[0] ?? agent.model) : undefined, "predeterminado");

  if (agent.provider?.type === "OPENROUTER" && agent.provider.isEnabled) {
    for (const model of modelsOf(agent.provider).slice(0, 4)) {
      add(agent.provider, model, "modelo libre alternativo");
    }
  }

  for (const provider of enabledProviders) {
    if (provider.id === agent.provider?.id) continue;
    if (provider.id === agent.fallbackProvider?.id) continue;
    if (provider.id === defaultProvider?.id) continue;
    add(provider, modelsOf(provider)[0] ?? agent.model, "proveedor alternativo");
  }

  return { candidates, reasons };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new AIProviderError("Ejecución cancelada", "CANCELLED"));
    };
    if (signal?.aborted) {
      clearTimeout(timeout);
      reject(new AIProviderError("Ejecución cancelada", "CANCELLED"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Central AI entry point. Agents never talk to a provider directly; this layer
 * resolves provider + model, applies quotas, retries transient failures and
 * records real usage. Task token budgets are not enforced.
 */
export async function completeForAgent(input: CompletionInput): Promise<ChatResult> {
  const settings = await getOfficeSettings();
  if (settings.officePaused) {
    throw new AIProviderError("La oficina está pausada por el administrador", "OFFICE_PAUSED");
  }

  const agent = (await db.agent.findUnique({
    where: { id: input.agentId },
    include: { provider: true, fallbackProvider: true },
  })) as AgentWithProviders | null;

  if (!agent) {
    throw new AIProviderError("El agente asignado no existe", "NOT_CONFIGURED");
  }

  if (agent.dailyTokenLimit) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usage = await db.aIUsage.aggregate({
      where: { agentId: agent.id, createdAt: { gte: startOfDay } },
      _sum: { totalTokens: true },
    });
    if ((usage._sum.totalTokens ?? 0) >= agent.dailyTokenLimit) {
      throw new AIProviderError(
        `${agent.name} alcanzó su límite diario de ${agent.dailyTokenLimit} tokens`,
        "QUOTA",
      );
    }
  }

  const taskId = input.taskId;
  if (taskId) {
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { status: true, pausedAt: true },
    });

    if (!task) throw new AIProviderError("La tarea no existe", "NOT_CONFIGURED");
    if (task.status === "CANCELLED") throw new AIProviderError("La tarea fue cancelada", "CANCELLED");
    if (task.pausedAt) throw new AIProviderError("La tarea está pausada", "TASK_PAUSED");
  }

  const maxOutputTokens = input.maxOutputTokens;

  const enabledProviders = await db.aIProvider.findMany({
    where: { isEnabled: true },
    orderBy: { priority: "asc" },
  });

  const { candidates, reasons } = buildCandidates(agent, enabledProviders);

  if (candidates.length === 0) {
    throw new AIProviderError(
      `No hay proveedor de IA disponible para ${agent.name}. ${reasons.join("; ") || "Configura una clave en Inteligencia artificial."}`,
      "NOT_CONFIGURED",
    );
  }

  let lastError: AIProviderError | null = null;

  for (const candidate of candidates) {
    const { provider } = candidate;

      let apiKey: string | null = null;
      if (provider.type !== "OLLAMA") {
        try {
          apiKey = provider.apiKeyCipher
            ? decryptSecret(provider.apiKeyCipher)
            : provider.type === "OPENROUTER"
              ? getOpenRouterApiKey()
              : null;
        } catch {
          lastError = new AIProviderError(
            `No se pudo descifrar la clave de ${provider.name}. Vuelve a guardarla.`,
            "AUTH",
            { provider: provider.name },
          );
          continue;
        }
      }

      if (provider.type !== "OLLAMA" && !apiKey) {
        lastError = new AIProviderError(`${provider.name} no tiene clave de API`, "NOT_CONFIGURED", {
          provider: provider.name,
        });
        continue;
      }

      const config: ProviderConfig = {
        id: provider.id,
        name: provider.name,
        type: provider.type as AIProviderKind,
        baseUrl: provider.baseUrl,
        apiKey,
        models: modelsOf(provider),
      };

      const adapter = getAdapter(provider.type as AIProviderKind);
      const request: ChatRequest = {
        model: candidate.model,
        system: input.system,
        messages: input.messages,
        maxOutputTokens,
        temperature: input.temperature,
        responseFormat: input.responseFormat,
        signal: input.signal,
      };

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const result = await adapter(config, request);

          if (taskId) {
            const after = await db.task.findUnique({ where: { id: taskId }, select: { status: true } });
            if (after?.status === "CANCELLED") {
              throw new AIProviderError("La tarea fue cancelada durante la ejecución", "CANCELLED");
            }

            await db.task.update({
              where: { id: taskId },
              data: { tokensUsed: { increment: result.totalTokens } },
            }).catch((error) => console.error("[ai] no se pudo actualizar el consumo de la tarea", error));
          }

          try {
            await db.aIUsage.create({
              data: {
                agentId: agent.id,
                providerId: provider.id,
                runId: input.runId ?? null,
                taskId,
                model: result.model,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                totalTokens: result.totalTokens,
              },
            });
          } catch (usageError) {
            console.error("[ai] no se pudo registrar el consumo", usageError);
          }

          return result;
        } catch (error) {
          const normalized =
            error instanceof AIProviderError
              ? error
              : new AIProviderError(
                  `Error inesperado de ${provider.name}: ${(error as Error).message}`,
                  "UNKNOWN",
                  { provider: provider.name },
                );

          if (normalized.code === "CANCELLED" || normalized.code === "OFFICE_PAUSED" || normalized.code === "TASK_PAUSED") {
            throw normalized;
          }

          lastError = normalized;

          if (!normalized.retryable || attempt === 2 || normalized.code === "RATE_LIMIT") break;
          await delay(600 * attempt, input.signal);
        }
      }
    }

    throw (
      lastError ??
      new AIProviderError("Ningún proveedor de IA pudo completar la solicitud", "UNKNOWN")
    );
}
