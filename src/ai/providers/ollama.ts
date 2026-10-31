import { fetchJson } from "../http";
import {
  AIProviderError,
  estimateTokens,
  type AIAdapter,
  type AIProviderKind,
  type ChatResult,
  type ProviderConfig,
} from "../types";

const DEFAULT_BASE_URL = "http://localhost:11434";

type OllamaResponse = {
  message?: { content?: unknown };
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
};

export async function callOllama(provider: ProviderConfig, request: Parameters<AIAdapter>[1]): Promise<ChatResult> {
  const baseUrl = (provider.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const body = {
    model: request.model,
    stream: false,
    messages: [
      { role: "system", content: request.system },
      ...request.messages.map((message) => ({ role: message.role, content: message.content })),
    ],
    ...(request.responseFormat === "json" ? { format: "json" } : {}),
    options: {
      num_predict: request.maxOutputTokens,
      temperature: request.temperature ?? 0.4,
    },
  };

  const payload = (await fetchJson(
    `${baseUrl}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { provider: "Ollama", signal: request.signal },
  )) as OllamaResponse;

  const content = payload.message?.content;
  const text = typeof content === "string" ? content.trim() : "";

  if (!text) {
    throw new AIProviderError(
      "Ollama devolvió una respuesta vacía. Comprueba que el modelo está descargado.",
      "SERVER",
      { provider: "Ollama", retryable: true },
    );
  }

  const inputTokens = payload.prompt_eval_count ?? estimateTokens(request.system + JSON.stringify(request.messages));
  const outputTokens = payload.eval_count ?? estimateTokens(text);

  return {
    text,
    model: request.model,
    providerId: provider.id,
    providerType: provider.type as AIProviderKind,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    finishReason: payload.done_reason ?? "stop",
  };
}
