export function extractApiError(payload: unknown, fallback = "No se pudo completar la operación"): string {
  if (!payload || typeof payload !== "object") return fallback;
  const error = (payload as { error?: { message?: string; details?: { fieldErrors?: Record<string, string[]> } } }).error;
  if (!error) return fallback;

  const fieldErrors = error.details?.fieldErrors;
  if (fieldErrors) {
    const first = Object.entries(fieldErrors).find(([, messages]) => Array.isArray(messages) && messages.length > 0);
    if (first) return `${first[0]}: ${first[1]?.[0] ?? "valor inválido"}`;
  }

  return error.message ?? fallback;
}
