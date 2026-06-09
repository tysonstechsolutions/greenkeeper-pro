/**
 * Classify the files in a PR bundle into roles — PR / quote / Section 889 —
 * by filename, so the one dropzone can sort a zip's contents (or a set of loose
 * files) into the right slots. Best-effort and unit-tested; the upload UI lets
 * the reviewer fix any wrong guess.
 */

export type FileRole = "pr" | "quote" | "section_889" | "unknown";

export interface RoledFile {
  name: string;
  role: FileRole;
}

// Most specific first. 889 reps are unmistakable; quotes and PRs have their own
// vocabulary. Checked in order: 889 → PR → quote.
const RE_889 =
  /\b889\b|section[\s_-]?889|sam[\s.]?gov|representation|certification/i;
const RE_PR = /purchase[\s_-]?request|\bnaf\b|\bp\.?\s?r\.?\b|fy\d{2}[-_\s]/i;
const RE_QUOTE =
  /\bquote\b|\binvoice\b|\bcart\b|\bpro[\s-]?forma\b|\bestimate\b|order[\s_-]?confirm|receipt/i;

/** Guess one file's role from its name. */
export function classifyFileRole(filename: string): FileRole {
  const n = (filename || "").trim();
  if (RE_889.test(n)) return "section_889";
  if (RE_PR.test(n)) return "pr";
  if (RE_QUOTE.test(n)) return "quote";
  return "unknown";
}

/**
 * Assign roles to the files of ONE bundle, promoting unknowns to fill any
 * empty slot in PR → quote → 889 order. Never overwrites a confident guess and
 * never forces a second same-role file into a different role.
 */
export function assignBundleRoles(names: string[]): RoledFile[] {
  const roled: RoledFile[] = names.map((name) => ({
    name,
    role: classifyFileRole(name),
  }));
  const has = (r: FileRole) => roled.some((x) => x.role === r);

  for (const slot of ["pr", "quote", "section_889"] as const) {
    if (has(slot)) continue;
    const u = roled.find((x) => x.role === "unknown");
    if (u) u.role = slot;
  }
  return roled;
}
