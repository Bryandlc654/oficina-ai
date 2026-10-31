export type AIProviderKind = "GEMINI" | "GROQ" | "OLLAMA" | "OPENAI" | "OPENROUTER";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  temperature?: number;
  responseFormat?: "text" | "json";
  signal?: AbortSignal;
};

export type ChatResult = {
  text: string;
  model: string;
  providerId: string;
  providerType: AIProviderKind;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  finishReason: string;
};

export type ProviderConfig = {
  id: string;
  name: string;
  type: AIProviderKind;
  baseUrl: string | null;
  apiKey: string | null;
  models: string[];
};

export type AIErrorCode =
  | "NOT_CONFIGURED"
  | "AUTH"
  | "QUOTA"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "SERVER"
  | "BAD_REQUEST"
  | "BUDGET_EXCEEDED"
  | "OFFICE_PAUSED"
  | "TASK_PAUSED"
  | "CANCELLED"
  | "UNKNOWN";

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly provider?: string;

  constructor(
    message: string,
    code: AIErrorCode,
    options: { retryable?: boolean; status?: number; provider?: string } = {},
  ) {
    super(message);
    this.name = "AIProviderError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.provider = options.provider;
  }
}

export type AIAdapter = (provider: ProviderConfig, request: ChatRequest) => Promise<ChatResult>;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
