import { fetchJson } from "../http";
import {
  AIProviderError,
  estimateTokens,
  type AIAdapter,
  type AIProviderKind,
  type ChatResult,
  type ProviderConfig,
} from "../types";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

type OpenRouterResponse = {
  model?: string;
  choices?: {
    message?: { content?: unknown; reasoning?: unknown };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; cost?: number };
  error?: { message?: string };
};

export async function callOpenRouter(
  provider: ProviderConfig,
  request: Parameters<AIAdapter>[1],
): Promise<ChatResult> {
  if (!provider.apiKey) {
    throw new AIProviderError("OpenRouter no tiene clave de API configurada", "NOT_CONFIGURED", {
      provider: "OpenRouter",
    });
  }

  const baseUrl = (provider.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

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
        "HTTP-Referer": appUrl,
        "X-Title": "AI Virtual Office",
      },
      body: JSON.stringify(body),
    },
    { provider: "OpenRouter", signal: request.signal },
  )) as OpenRouterResponse;

  const choice = payload.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";

  if (!text) {
    const reasoning = typeof choice?.message?.reasoning === "string" ? choice.message.reasoning : "";
    throw new AIProviderError(
      reasoning
        ? "OpenRouter agotó el presupuesto antes de devolver contenido (el modelo razonó sin responder)"
        : "OpenRouter devolvió una respuesta vacía",
      "SERVER",
      { provider: "OpenRouter", retryable: true },
    );
  }

  const inputTokens = payload.usage?.prompt_tokens ?? estimateTokens(request.system + JSON.stringify(request.messages));
  const outputTokens = payload.usage?.completion_tokens ?? estimateTokens(text);

  return {
    text,
    model: payload.model ?? request.model,
    providerId: provider.id,
    providerType: provider.type as AIProviderKind,
    inputTokens,
    outputTokens,
    totalTokens: payload.usage?.total_tokens ?? inputTokens + outputTokens,
    finishReason: choice?.finish_reason ?? "stop",
  };
}
