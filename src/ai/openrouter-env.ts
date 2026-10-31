/**
 * OpenRouter can be configured through the encrypted panel key or through the
 * environment. The environment key is never sent to the browser.
 */
export function getOpenRouterApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim() || process.env.openrouter_api_key?.trim();
  return key && key.length > 0 ? key : null;
}

/** Keys that can come from the deployment environment instead of the encrypted panel field. */
export function getEnvApiKey(type: string): string | null {
  if (type === "OPENROUTER") return getOpenRouterApiKey();
  if (type === "OPENAI") return process.env.OPENAI_API_KEY?.trim() || null;
  return null;
}

export function getOpenRouterDefaultModel(): string {
  return process.env.OPENROUTER_DEFAULT_MODEL?.trim() || "cohere/north-mini-code:free";
}
