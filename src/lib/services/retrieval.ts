const STOPWORDS = new Set([
  "para", "como", "este", "esta", "esto", "estos", "estas", "con", "por", "los", "las", "del",
  "que", "una", "uno", "unos", "unas", "sus", "mas", "pero", "desde", "entre", "sobre", "todo",
  "toda", "todos", "todas", "hacia", "segun", "cuando", "donde", "muy", "sin", "ser", "son",
  "fue", "han", "hay", "aqui", "alli", "otro", "otra", "otros", "otras", "cada", "solo", "tambien",
  "debe", "deben", "puede", "pueden", "hacer", "hace", "hacia", "desde", "nuestro", "nuestra",
  "the", "and", "for", "with", "from", "that", "this", "your", "you", "are", "was", "were",
]);

export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function overlap(queryTokens: string[], text: string, weight: number): number {
  if (queryTokens.length === 0) return 0;
  const tokens = new Set(tokenize(text));
  let score = 0;
  for (const token of queryTokens) {
    if (tokens.has(token)) score += weight;
  }
  return score;
}

/**
 * Ranks knowledge entries by lexical relevance to the current work context.
 * Entries with no overlap are kept as a fallback (recent/important first), but
 * after relevant ones, so context is selective without going empty.
 */
export function rankByRelevance<T>(
  entries: T[],
  query: string,
  getText: (entry: T) => string[],
  getBoost: (entry: T) => number = () => 0,
): T[] {
  const queryTokens = tokenize(query);

  return entries
    .map((entry, index) => {
      const texts = getText(entry);
      const score = texts.reduce((total, text, position) => {
        const weight = Math.max(1, 4 - position);
        return total + overlap(queryTokens, text, weight);
      }, 0);

      return { entry, index, score: score + getBoost(entry) };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    })
    .map((item) => item.entry);
}

export function buildBudgetedBlock(
  entries: { heading: string; content: string }[],
  maxChars: number,
): string {
  if (entries.length === 0) return "";

  const parts: string[] = [];
  let used = 0;

  for (const entry of entries) {
    const block = `${entry.heading}\n${entry.content}`;

    if (parts.length > 0 && used + block.length > maxChars) break;

    if (parts.length === 0 && block.length > maxChars) {
      parts.push(`${block.slice(0, maxChars)}\n[…truncado…]`);
      break;
    }

    parts.push(block);
    used += block.length + 2;
  }

  return parts.join("\n\n");
}
