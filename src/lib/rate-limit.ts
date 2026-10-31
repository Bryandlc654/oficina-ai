type Attempt = { count: number; resetAt: number };

const attempts = new Map<string, Attempt>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

/** Lightweight in-memory limiter. Use Redis-backed limiting when running multiple instances. */
export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  current.count += 1;
  if (current.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}
