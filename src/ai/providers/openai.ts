import { fetchJson } from "../http";
import {
  AIProviderError,
  estimateTokens,
  type AIAdapter,
  type AIProviderKind,
  type ChatResult,
  type ProviderConfig,
} from "../types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

type OpenAIResponse = {
  choices?: { message?: { content?: unknown; refusal?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

/**
 * Reasoning models (gpt-5 family, o-series) reject `temperature` and spend part of
 * `max_completion_tokens` thinking, so they get a low effort and extra room.
 */
export function openAIReasoningBudget(model: string): number | undefined {
  const id = model.toLowerCase().replace(/^openai\//, "");
  if (/^gpt-5(?!.*-chat)/.test(id) || /^o\d/.test(id)) return 2048;
  return undefined;
}

export async function callOpenAI(provider: ProviderConfig, request: Parameters<AIAdapter>[1]): Promise<ChatResult> {
  if (!provider.apiKey) {
    throw new AIProviderError("OpenAI no tiene clave de API configurada", "NOT_CONFIGURED", {
      provider: "OpenAI",
    });
  }

  const baseUrl = (provider.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const reasoningBudget = openAIReasoningBudget(request.model);
  const body = {
    model: request.model,
    messages: [
      { role: "system", content: request.system },
      ...request.messages.map((message) => ({ role: message.role, content: message.content })),
    ],
    max_completion_tokens: request.maxOutputTokens + (reasoningBudget ?? 0),
    ...(reasoningBudget === undefined
      ? { temperature: request.temperature ?? 0.4 }
      : { reasoning_effort: "low" }),
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
    { provider: "OpenAI", signal: request.signal },
  )) as OpenAIResponse;

  const choice = payload.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";

  if (!text) {
    const refusal = typeof choice?.message?.refusal === "string" ? `: ${choice.message.refusal}` : "";
    throw new AIProviderError(`OpenAI devolvió una respuesta vacía${refusal}`, "SERVER", {
      provider: "OpenAI",
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
    finishReason: choice?.finish_reason ?? "stop",
  };
}
