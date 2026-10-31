import { fetchJson } from "../http";
import {
  AIProviderError,
  estimateTokens,
  type AIAdapter,
  type AIProviderKind,
  type ChatResult,
  type ProviderConfig,
} from "../types";

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

type GroqResponse = {
  choices?: { message?: { content?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

export async function callGroq(provider: ProviderConfig, request: Parameters<AIAdapter>[1]): Promise<ChatResult> {
  if (!provider.apiKey) {
    throw new AIProviderError("Groq no tiene clave de API configurada", "NOT_CONFIGURED", {
      provider: "Groq",
    });
  }

  const baseUrl = (provider.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const body = {
    model: request.model,
    messages: [
      { role: "system", content: request.system },
      ...request.messages.map((message) => ({ role: message.role, content: message.content })),
    ],
    max_tokens: request.maxOutputTokens,
    temperature: request.temperature ?? 0.4,
    ...(request.responseFormat === "json" ? { response_format: { type: "json_object" } } : {}),
  };

  const payload = (await fetchJson(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
    },
    { provider: "Groq", signal: request.signal },
  )) as GroqResponse;

  const content = payload.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";

  if (!text) {
    throw new AIProviderError("Groq devolvió una respuesta vacía", "SERVER", {
      provider: "Groq",
      retryable: true,
    });
  }

  const inputTokens = payload.usage?.prompt_tokens ?? estimateTokens(request.system + JSON.stringify(request.messages));
  const outputTokens = payload.usage?.completion_tokens ?? estimateTokens(text);

  return {
    text,
    model: request.model,
    providerId: provider.id,
    providerType: provider.type as AIProviderKind,
    inputTokens,
    outputTokens,
    totalTokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
    finishReason: payload.choices?.[0]?.finish_reason ?? "stop",
  };
}
