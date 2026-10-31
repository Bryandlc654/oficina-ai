/**
 * Quality ranking used when an employee picks its own model ("automático").
 * Scores are rough 0-100 judgements of general business-writing quality in Spanish,
 * not benchmarks; unknown models get a score from their name (size, tier, focus).
 */

export type ModelPurpose = "work" | "review" | "chat";

export type RankableModel = { providerType: string; model: string };

// Matched in order against the lowercased model id; first hit wins.
const KNOWN: [RegExp, number][] = [
  [/gemini-[\d.]+-pro/, 92],
  [/deepseek.*(r1|v3)/, 84],
  [/gemini-[\d.]+-flash-lite/, 72],
  [/gemini-[\d.]+-flash/, 85],
  [/gpt-oss-120b/, 82],
  [/llama-?3\.3-70b|llama-?3\.1-70b/, 74],
  [/qwen3.*(32b|30b|235b)/, 76],
  [/gemma-?\d+-(27|31)b/, 70],
  [/gpt-oss-20b/, 68],
  [/mistral-large/, 82],
  [/mistral-(small|medium)/, 72],
  [/llama-?3\.\d-8b|llama3\.\d:8b/, 50],
  [/north-mini-code/, 45],
  [/^openrouter\/(free|auto)$/, 55],
];

function heuristicScore(model: string): number {
  let score = 58;
  const params = /(\d+(?:\.\d+)?)b\b/.exec(model);
  if (params) {
    const billions = Number(params[1]);
    // Active-parameter MoE ids ("26b-a4b") are weaker than their total size suggests.
    const active = /-a(\d+)b/.exec(model);
    const effective = active ? Number(active[1]) * 3 : billions;
    score = 40 + Math.min(40, Math.log2(Math.max(1, effective)) * 6);
  }
  if (/\bpro\b|-pro/.test(model)) score += 6;
  if (/mini|nano|lite|small|tiny|instant/.test(model)) score -= 8;
  // Code-tuned models write worse marketing and business documents.
  if (/code|coder/.test(model)) score -= 10;
  return Math.round(Math.max(20, Math.min(90, score)));
}

export function modelQuality(model: string): number {
  const id = model.toLowerCase();
  for (const [pattern, score] of KNOWN) {
    if (pattern.test(id)) return score;
  }
  return heuristicScore(id);
}

/** Purpose-adjusted score: chat favours fast replies, the rest favour raw quality. */
export function modelScore(candidate: RankableModel, purpose: ModelPurpose): number {
  const id = candidate.model.toLowerCase();
  let score = modelQuality(id);
  if (purpose === "chat") {
    if (/-pro\b|-pro-|deepseek.*r1/.test(id)) score -= 12;
    if (candidate.providerType === "GROQ") score += 6;
  }
  // Local models are a last resort on a hosted deployment.
  if (candidate.providerType === "OLLAMA") score -= 15;
  return score;
}

export function rankModels<T extends RankableModel>(candidates: T[], purpose: ModelPurpose): T[] {
  return candidates
    .map((candidate, index) => ({ candidate, index, score: modelScore(candidate, purpose) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.candidate);
}
