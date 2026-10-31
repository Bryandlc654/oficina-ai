import { fetchJson } from "../http";
import {
  AIProviderError,
  estimateTokens,
  type AIAdapter,
  type AIProviderKind,
  type ChatResult,
  type ProviderConfig,
} from "../types";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

type GeminiPart = { text?: unknown };
type GeminiResponse = {
  candidates?: {
    content?: { parts?: GeminiPart[] };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { message?: string };
};

/**
 * Gemini 2.5+ models think before answering. Pro cannot turn it off (minimum 128),
 * Flash can; both get a small fixed budget so cost stays predictable.
 */
export function geminiThinkingBudget(model: string): number | undefined {
  const match = /gemini-(\d+(?:\.\d+)?)/.exec(model);
  if (!match || Number(match[1]) < 2.5) return undefined;
  if (/-pro/.test(model)) return 1024;
  if (/flash-lite/.test(model)) return 0;
  return 512;
}

export async function callGemini(provider: ProviderConfig, request: Parameters<AIAdapter>[1]): Promise<ChatResult> {
  if (!provider.apiKey) {
    throw new AIProviderError("Google Gemini no tiene clave de API configurada", "NOT_CONFIGURED", {
      provider: "Google Gemini",
    });
  }

  const baseUrl = (provider.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const url = `${baseUrl}/models/${encodeURIComponent(request.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;

  const thinkingBudget = geminiThinkingBudget(request.model);
  const body = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    generationConfig: {
      // Thinking tokens count against maxOutputTokens, so they get their own room on top.
      maxOutputTokens: request.maxOutputTokens +(thinkingBudget ?? 0),
      temperature: request.temperature ?? 0.4,
      ...(request.responseFormat === "json" ? { responseMimeType: "application/json" } : {}),
      ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
    },
  };

  const payload = (await fetchJson(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { provider: "Google Gemini", signal: request.signal },
  )) as GeminiResponse;

  const candidate = payload.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  if (!text) {
    throw new AIProviderError("Google Gemini devolvió una respuesta vacía", "SERVER", {
      provider: "Google Gemini",
      retryable: true,
    });
  }

  const inputTokens = payload.usageMetadata?.promptTokenCount ?? estimateTokens(request.system + JSON.stringify(request.messages));
  const outputTokens = payload.usageMetadata?.candidatesTokenCount ?? estimateTokens(text);

  return {
    text,
    model: request.model,
    providerId: provider.id,
    providerType: provider.type as AIProviderKind,
    inputTokens,
    outputTokens,
    totalTokens: payload.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens,
    finishReason: candidate?.finishReason ?? "STOP",
  };
}
