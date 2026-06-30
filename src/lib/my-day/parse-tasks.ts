/**
 * Parse a pasted/typed list (or CSV/TSV dump) into task titles — the no-AI
 * fallback for My Day bulk import. One task per line; strips bullets/numbering/
 * checkboxes and takes the first column of comma/tab rows. The AI path
 * (bulk-tasks) handles messy input + deadline detection; this just covers a
 * clean list when the edge function isn't available.
 */
const MAX_TASKS = 100;
const BULLET = /^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s+/;

export function parseTaskList(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(BULLET, "").trim();
    // Take the first column of a comma/tab separated row.
    const sep = line.search(/[,\t]/);
    if (sep > 0) line = line.slice(0, sep).trim();
    if (!line) continue;
    out.push(line.slice(0, 300));
    if (out.length >= MAX_TASKS) break;
  }
  return out;
}
