import type { AIAdapter, AIProviderKind } from "../types";
import { callGemini } from "./gemini";
import { callGroq } from "./groq";
import { callOllama } from "./ollama";
import { callOpenAI } from "./openai";
import { callOpenRouter } from "./openrouter";

const ADAPTERS: Record<AIProviderKind, AIAdapter> = {
  GEMINI: callGemini,
  GROQ: callGroq,
  OLLAMA: callOllama,
  OPENAI: callOpenAI,
  OPENROUTER: callOpenRouter,
};

export function getAdapter(type: AIProviderKind): AIAdapter {
  return ADAPTERS[type];
}
