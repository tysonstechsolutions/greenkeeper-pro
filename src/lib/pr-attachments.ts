/**
 * Helpers for the PR "Other (specify)" attachment field.
 *
 * The NAVMIDLANT PR form has no dedicated checkbox for a Statement of Work,
 * so when a SOW is attached we fold it into the free-text "Other" box next to
 * the quote label — e.g. "Vendor Quote" becomes "Vendor Quote and SOW".
 */

/** Trailing " and SOW" / " SOW" / ", SOW" mention, case-insensitive. */
const SOW_SUFFIX_RE = /[\s,]*(?:and\s+)?SOW\s*$/i;

/**
 * Reconcile the "Other" attachment text with whether a SOW is attached:
 * append a single trailing "and SOW" when it is, strip it when it isn't.
 * Idempotent — safe to apply on every keystroke, toggle, and save.
 */
export function withSowSuffix(other: string, sowAttached: boolean): string {
  const base = (other ?? "").replace(SOW_SUFFIX_RE, "").trim();
  if (!sowAttached) return base;
  return base ? `${base} and SOW` : "SOW";
}
