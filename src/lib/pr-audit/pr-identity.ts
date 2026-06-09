/**
 * PR identity / de-duplication for the audit upload flow.
 *
 * A purchase request keeps its identity across re-uploads: when a PR is sent
 * back for corrections and re-uploaded, it's the SAME PR and must update the
 * existing record (never a second row that double-counts in the budget).
 *
 * Match priority:
 *   1. internal_order — the PR number (FY26-GC-0001). Survives corrections.
 *   2. file name      — exact, for when the AI couldn't read a PR number.
 *   3. vendor + date + total — a last-resort fuzzy match.
 *
 * Pure + unit-tested; no DB or React here.
 */

export interface MatchableAudit {
  id: string;
  internal_order: string | null;
  file_name: string | null;
  vendor_name: string | null;
  pr_date: string | null;
  computed_total: number | string | null;
}

export interface DupMatch<T> {
  audit: T;
  reason: "internal_order" | "filename" | "vendor_date_total";
}

/** Canonical PR number: uppercase, separators collapsed to single dashes. */
export function normalizeInternalOrder(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Vendor name reduced for matching: lowercase, no suffixes/punctuation. */
export function normalizeVendorName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .replace(/[.,&]/g, " ")
    .replace(
      /\b(inc|incorporated|llc|corp|corporation|co|company|ltd|limited|the)\b/g,
      " ",
    )
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normFilename(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase();
}

/**
 * Find the existing audit that the candidate is a (re-)upload of, or null.
 * `excludeId` skips a row so a record never matches itself on update.
 */
export function findExistingMatch<T extends MatchableAudit>(
  candidate: {
    internal_order: string | null;
    file_name: string | null;
    vendor_name: string | null;
    pr_date: string | null;
    computed_total: number | string | null;
  },
  existing: readonly T[],
  excludeId?: string,
): DupMatch<T> | null {
  const pool = excludeId ? existing.filter((e) => e.id !== excludeId) : existing;

  const io = normalizeInternalOrder(candidate.internal_order);
  if (io) {
    const m = pool.find((e) => normalizeInternalOrder(e.internal_order) === io);
    if (m) return { audit: m, reason: "internal_order" };
  }

  const fn = normFilename(candidate.file_name);
  if (fn) {
    const m = pool.find((e) => normFilename(e.file_name) === fn);
    if (m) return { audit: m, reason: "filename" };
  }

  const cv = normalizeVendorName(candidate.vendor_name);
  const cd = (candidate.pr_date || "").trim();
  const ct = Number(candidate.computed_total) || 0;
  if (cv && cd) {
    const m = pool.find(
      (e) =>
        normalizeVendorName(e.vendor_name) === cv &&
        (e.pr_date || "").trim() === cd &&
        Math.abs((Number(e.computed_total) || 0) - ct) <= 0.01,
    );
    if (m) return { audit: m, reason: "vendor_date_total" };
  }

  return null;
}
