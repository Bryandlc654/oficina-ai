export type MemoryProposal = {
  title: string;
  content: string;
};

const MEMORY_HEADING = /^#{1,3}\s*Memoria propuesta\s*$/im;

/**
 * Agents may append a "Memoria propuesta" section to a deliverable. The engine
 * persists those bullets as individual memory; they never modify the agent's
 * system prompt or permissions.
 */
export function extractMemoryProposals(text: string): { body: string; proposals: MemoryProposal[] } {
  const match = MEMORY_HEADING.exec(text);
  if (!match || match.index === undefined) {
    return { body: text.trim(), proposals: [] };
  }

  const body = text.slice(0, match.index).trim();
  const section = text.slice(match.index + match[0].length);

  const proposals = section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((content) => content.length >= 20 && content.length <= 600)
    .slice(0, 3)
    .map((content) => ({ title: content.slice(0, 80), content }));

  return { body: body.length > 0 ? body : text.trim(), proposals };
}
