/**
 * Quote-extraction types and the client-side logic that combines a
 * multi-page quote into a single result.
 *
 * The `extract-quote` edge function reads ONE image (or PDF) per call. When a
 * user uploads several photos/screenshots of a single quote — e.g. a shopping
 * cart too tall to capture in one picture — the client sends each page to the
 * function and then merges the per-page results here, on the device, so no
 * edge-function redeploy is needed and every page keeps its full resolution.
 */
import type { PurchaseRequestItem } from "@/types/database";
import { isSalesTaxItem } from "@/lib/pr-cc-fee";

/** Vendor block as returned by the extract-quote edge function. */
export interface ExtractedVendor {
  name: string | null;
  address: string | null;
  line2: string | null;
  city_state_zip: string | null;
  poc: string | null;
  email: string | null;
  phone: string | null;
}

/** A single line item as returned by the extract-quote edge function. */
export interface ExtractedItem {
  description: string;
  part_number: string | null;
  qty: number;
  unit: string | null;
  unit_price: number;
}

/** One option within a clarification (a price/qty branch the user can pick). */
export interface ClarificationOption {
  label: string;
  item_overrides: Array<{
    match_description: string;
    unit_price: number;
    qty?: number | null;
    unit?: string | null;
  }>;
}

/** A question the AI surfaces when a quote was genuinely ambiguous. */
export interface Clarification {
  question: string;
  options?: ClarificationOption[] | null;
  applies_to?: string[] | null;
}

/** Full response shape from the extract-quote edge function. */
export interface ExtractedQuote {
  vendor: ExtractedVendor | null;
  items: ExtractedItem[];
  // Surfaced when the AI had to guess between multiple valid prices
  // (rental tiers, bulk-discount tiers, package levels, etc.).
  warnings: string[];
  clarifications?: Clarification[];
}

const VENDOR_FIELDS: ReadonlyArray<keyof ExtractedVendor> = [
  "name",
  "address",
  "line2",
  "city_state_zip",
  "poc",
  "email",
  "phone",
];

/** A non-empty, non-whitespace string. */
function firstFilled(values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return null;
}

/** Stable de-dup key for a line item: description + part # + qty + price.
 *  Two rows that match on all four are the same physical cart line — the
 *  kind of exact duplicate produced when two screenshots overlap. */
function itemKey(it: ExtractedItem): string {
  const desc = (it.description || "").trim().toLowerCase();
  const pn = (it.part_number || "").trim().toLowerCase();
  const qty = Number(it.qty) || 0;
  const price = Number(it.unit_price) || 0;
  return `${desc}|${pn}|${qty}|${price}`;
}

/**
 * Warnings that are really per-PAGE completeness commentary. When the model
 * reads one page in isolation it doesn't know other pages exist, so it says
 * things like "this page has no line items", "products not shown in this
 * image", "provide the full cart", or "this fee is not included as a line
 * item". The moment ANOTHER page of the same upload supplies those products
 * (or that fee), these notes become false or contradictory — exactly what
 * made a perfect multi-page extraction look broken. We scrub them ONLY when
 * combining 2+ pages; a lone summary page keeps the guidance.
 */
const PAGE_SCOPE_NOISE_PATTERNS: readonly RegExp[] = [
  /\bno (?:individual |product )*line items?\b/i,
  /\bnot shown in this (?:image|page)\b/i,
  /\bonly an?\b[^.]*\b(?:order summary|summary|totals?)\b/i,
  /\bplease provide\b[^.]*\b(?:cart|quote|invoice|line items?|products?)\b/i,
  /\brepresents\b[^.]*\bnot shown\b/i,
  /\bnot included as a line item\b/i,
];

function isPageScopeNoise(warning: string): boolean {
  return PAGE_SCOPE_NOISE_PATTERNS.some((re) => re.test(warning));
}

/**
 * Reduce multiple sales-tax lines to a single one — the largest (final)
 * amount. A multi-page upload can surface tax on more than one page (an
 * estimate on the cart page, the final tax on the order-summary page); the
 * Purchase Request must never be taxed twice.
 */
function collapseSalesTaxLines(items: ExtractedItem[]): ExtractedItem[] {
  const taxItems = items.filter(isSalesTaxItem);
  if (taxItems.length <= 1) return items;
  const keep = taxItems.reduce((best, it) =>
    (Number(it.unit_price) || 0) > (Number(best.unit_price) || 0) ? it : best,
  );
  return items.filter((it) => !isSalesTaxItem(it) || it === keep);
}

/**
 * Combine the per-page extraction results of ONE multi-page quote into a
 * single result.
 *
 * - 0 pages  -> an empty result.
 * - 1 page   -> that page, unchanged (keeps the proven single-image path
 *               byte-for-byte identical to the pre-multi-page behavior).
 * - 2+ pages -> items concatenated in page order with exact-duplicate rows
 *               collapsed (overlap guard); vendor filled field-by-field from
 *               the first page that has each field; warnings and
 *               clarifications merged and de-duplicated.
 */
export function combineExtractions(results: ExtractedQuote[]): ExtractedQuote {
  if (results.length === 0) {
    return { vendor: null, items: [], warnings: [] };
  }
  if (results.length === 1) {
    return results[0];
  }

  // Items — concatenate in page order, drop exact duplicates, then collapse
  // any duplicate sales-tax lines surfaced by separate pages into one.
  const deduped: ExtractedItem[] = [];
  const seenItems = new Set<string>();
  for (const r of results) {
    for (const it of r.items ?? []) {
      const key = itemKey(it);
      if (seenItems.has(key)) continue;
      seenItems.add(key);
      deduped.push(it);
    }
  }
  const items = collapseSalesTaxLines(deduped);

  // Vendor — first non-empty value per field across pages.
  const vendor: ExtractedVendor = {
    name: null,
    address: null,
    line2: null,
    city_state_zip: null,
    poc: null,
    email: null,
    phone: null,
  };
  let vendorHasAny = false;
  for (const field of VENDOR_FIELDS) {
    const val = firstFilled(results.map((r) => r.vendor?.[field] ?? null));
    if (val !== null) {
      vendor[field] = val;
      vendorHasAny = true;
    }
  }

  // Warnings — merged, de-duplicated, blanks dropped, and stripped of
  // per-page completeness noise that another page already resolved.
  const warnings: string[] = [];
  const seenWarnings = new Set<string>();
  for (const r of results) {
    for (const w of r.warnings ?? []) {
      if (!w || !w.trim()) continue;
      if (isPageScopeNoise(w)) continue;
      if (seenWarnings.has(w)) continue;
      seenWarnings.add(w);
      warnings.push(w);
    }
  }

  // Clarifications — concatenated, de-duplicated by question text.
  const clarifications: Clarification[] = [];
  const seenQuestions = new Set<string>();
  for (const r of results) {
    for (const c of r.clarifications ?? []) {
      const q = (c.question || "").trim().toLowerCase();
      if (seenQuestions.has(q)) continue;
      seenQuestions.add(q);
      clarifications.push(c);
    }
  }

  return {
    vendor: vendorHasAny ? vendor : null,
    items,
    warnings,
    ...(clarifications.length > 0 ? { clarifications } : {}),
  };
}

/**
 * True when at least one item carries real content (a description, part
 * number, positive quantity, or positive price). Used to decide whether an
 * extraction should REPLACE the current line items (fresh/blank form) or be
 * APPENDED to what's already there. Mirrors the long-standing inline
 * heuristic, including treating the auto-managed credit-card fee row — which
 * always has a description — as "real".
 */
export function hasRealItems(items: PurchaseRequestItem[]): boolean {
  return items.some(
    (it) =>
      (it.description || "").trim() !== "" ||
      !!it.part_number ||
      (Number(it.qty) || 0) > 0 ||
      (Number(it.unit_price) || 0) > 0,
  );
}
