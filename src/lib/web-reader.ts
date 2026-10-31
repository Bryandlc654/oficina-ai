/**
 * Reads public web pages as Markdown through Jina Reader (r.jina.ai).
 * Works without a key at a low rate limit; JINA_API_KEY raises it.
 */

const READER_URL = "https://r.jina.ai/";
const MAX_CHARS_PER_PAGE = 6_000;
const TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

export type WebPage = { url: string; ok: true; content: string } | { url: string; ok: false; error: string };

// Per process: a page read once is free for the next six hours.
const cache = new Map<string, { at: number; page: WebPage }>();

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]]+/gi;
const READ_REQUEST = /\[\[LEER:\s*(https?:\/\/[^\s\]]+)\s*\]\]/gi;

export function extractUrls(text: string): string[] {
  const urls = Array.from(text.matchAll(URL_PATTERN), (match) => match[0].replace(/[.,;:!?]+$/, ""));
  return [...new Set(urls)].filter(isPublicHttpUrl);
}

/** URLs an agent asked to read with [[LEER: url]] lines. */
export function extractReadRequests(text: string): string[] {
  const urls = Array.from(text.matchAll(READ_REQUEST), (match) => (match[1] ?? "").replace(/[.,;:!?]+$/, ""));
  return [...new Set(urls)].filter(isPublicHttpUrl);
}

export function stripReadRequests(text: string): string {
  return text.replace(READ_REQUEST, "").trim();
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return !(
      host === "localhost" ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) ||
      host === "[::1]"
    );
  } catch {
    return false;
  }
}

export async function readWebPage(url: string): Promise<WebPage> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.page;

  const key = process.env.JINA_API_KEY?.trim();
  let page: WebPage;
  try {
    const response = await fetch(`${READER_URL}${url}`, {
      headers: {
        Accept: "text/plain",
        "X-Return-Format": "markdown",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      page = {
        url,
        ok: false,
        error: response.status === 429 ? "límite de lecturas alcanzado, prueba más tarde" : `error ${response.status}`,
      };
    } else {
      const text = (await response.text()).trim();
      page = text
        ? {
            url,
            ok: true,
            content: text.length > MAX_CHARS_PER_PAGE ? `${text.slice(0, MAX_CHARS_PER_PAGE)}\n[…página recortada…]` : text,
          }
        : { url, ok: false, error: "la página no devolvió contenido" };
    }
  } catch (error) {
    page = { url, ok: false, error: (error as Error).name === "TimeoutError" ? "tiempo de espera agotado" : "no se pudo conectar" };
  }

  // Failures are not cached, so a rate limit or timeout can be retried later.
  if (page.ok) {
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(url, { at: Date.now(), page });
  }
  return page;
}

export async function readWebPages(urls: string[]): Promise<WebPage[]> {
  return Promise.all(urls.map((url) => readWebPage(url)));
}

export function formatWebPages(pages: WebPage[]): string {
  return pages
    .map((page) => (page.ok ? `### ${page.url}\n${page.content}` : `### ${page.url}\n(No se pudo leer: ${page.error})`))
    .join("\n\n");
}
