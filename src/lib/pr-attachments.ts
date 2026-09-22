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

/**
 * Is this "Other" text something the app filled in (and may replace), rather
 * than wording the user typed? Blank, a pricing-method label ("Vendor Quote",
 * "Vendor Cart", …) or a quote filename ("QUOTE-FY26-GC-0058-…", e.g. carried
 * over from a cloned PR) all count — with or without the "and SOW" suffix.
 */
export function isAutoOtherText(other: string, methodLabels: readonly string[]): boolean {
  const base = (other ?? "").replace(SOW_SUFFIX_RE, "").trim();
  if (!base) return true;
  if (/^QUOTE-/i.test(base)) return true;
  const lower = base.toLowerCase();
  return methodLabels.some((l) => l.toLowerCase() === lower);
}

/**
 * The "Other" box names the quote file sent in the bundle
 * ("QUOTE-FY27-GC-0002-AceHardware-Golf Course-September2026"). Auto-filled
 * text is replaced with that name; anything the user typed is kept.
 */
export function otherWithQuoteName(
  other: string,
  quoteName: string,
  sowAttached: boolean,
  methodLabels: readonly string[],
): string {
  const base = isAutoOtherText(other, methodLabels) ? quoteName : other;
  return withSowSuffix(base, sowAttached);
}
