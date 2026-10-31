// Shared by the chat service (cleaning model output) and the chat UI (task cards).

const TASK_PROPOSAL = /\[\[TAREA:\s*([^|\]]+?)\s*\|\s*([^\]]+?)\s*\]\]/;

// A short chunk repeated many times in a row: the model got stuck in a loop.
const REPETITION = /(.{1,30}?)\1{5,}/gsu;
// The office speaks Spanish; CJK output from small models is always a derail.
const FOREIGN_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export type CleanedReply = { text: string; degenerate: boolean };

function firstLoop(text: string): number {
  for (const match of text.matchAll(REPETITION)) {
    // Markdown rules and table separators ("------") repeat legitimately.
    if (/\p{L}/u.test(match[1] ?? "")) return match.index ?? -1;
  }
  return -1;
}

/** Cuts a reply at the first sign of a degenerate loop or script switch. */
export function cleanReply(raw: string): CleanedReply {
  const text = raw.trim();
  const cuts = [firstLoop(text), FOREIGN_SCRIPT.exec(text)?.index ?? -1].filter((index) => index >= 0);
  if (cuts.length === 0) return { text, degenerate: false };
  return { text: text.slice(0, Math.min(...cuts)).trimEnd(), degenerate: true };
}

export type TaskProposal = { title: string; objective: string };

export function extractTaskProposal(content: string): { body: string; proposal: TaskProposal | null } {
  const match = TASK_PROPOSAL.exec(content);
  if (!match) return { body: content, proposal: null };
  const title = (match[1] ?? "").trim().slice(0, 190);
  const objective = (match[2] ?? "").trim().slice(0, 5000);
  const body = content.replace(match[0], "").trim();
  if (title.length < 3 || objective.length < 10) return { body, proposal: null };
  return { body, proposal: { title, objective } };
}
