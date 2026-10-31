/**
 * OpenRouter can be configured through the encrypted panel key or through the
 * environment. The environment key is never sent to the browser.
 */
export function getOpenRouterApiKey(): string | null {
  const key = process.env.OPENROUTER_API_KEY?.trim() || process.env.openrouter_api_key?.trim();
  return key && key.length > 0 ? key : null;
}

export function getOpenRouterDefaultModel(): string {
  return process.env.OPENROUTER_DEFAULT_MODEL?.trim() || "cohere/north-mini-code:free";
}
