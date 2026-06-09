/**
 * Cross-checks for an uploaded PR bundle:
 *   • the vendor QUOTE total vs the PR's pre-fee subtotal (+ vendor match)
 *   • the Section 889's validity (compliant + not expired + right vendor)
 *
 * Pure + unit-tested. The findings are stored on the audit (bundle_findings),
 * separate from the deterministic audit so re-auditing never wipes them.
 */
import { isCcFeeItem } from "@/lib/pr-cc-fee";
import { normalizeVendorName } from "@/lib/pr-audit/pr-identity";

export type BundleSeverity = "error" | "warning" | "info";

export type BundleFindingCode =
  | "quote_total_mismatch"
  | "quote_vendor_mismatch"
  | "quote_ok"
  | "quote_missing"
  | "quote_unreadable"
  | "section_889_unreadable"
  | "section_889_expired"
  | "section_889_noncompliant"
  | "section_889_expiring"
  | "section_889_vendor_mismatch"
  | "section_889_ok"
  | "section_889_missing";

export interface BundleFinding {
  code: BundleFindingCode;
  severity: BundleSeverity;
  title: string;
  detail: string;
  suggestion: string | null;
}

interface Lineish {
  description?: string | null;
  qty: number | string;
  unit_price: number | string;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}
function money(n: number): string {
  return num(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}
function extSum(items: ReadonlyArray<Lineish>): number {
  return r2(items.reduce((s, it) => s + num(it.qty) * num(it.unit_price), 0));
}
function parseLocalNoon(iso: string): number {
  const anchored = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T12:00:00" : iso;
  return new Date(anchored).getTime();
}
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseLocalNoon(toIso) - parseLocalNoon(fromIso)) / 86_400_000);
}

/** Compare the vendor quote against the PR. Returns [] when there's no quote. */
export function checkQuoteAgainstPr(input: {
  prItems: ReadonlyArray<Lineish>;
  prVendor: string | null;
  quoteItems: ReadonlyArray<Lineish> | null;
  quoteVendor: string | null;
}): BundleFinding[] {
  if (!input.quoteItems) return [];
  const out: BundleFinding[] = [];

  // The PR adds a 3% card fee the vendor's quote won't have — exclude only that
  // line so products + shipping + tax are compared like-for-like.
  const prSubtotal = r2(
    input.prItems
      .filter((it) => !isCcFeeItem(it))
      .reduce((s, it) => s + num(it.qty) * num(it.unit_price), 0),
  );
  const quoteTotal = extSum(input.quoteItems);

  if (Math.abs(prSubtotal - quoteTotal) > 0.01) {
    out.push({
      code: "quote_total_mismatch",
      severity: "error",
      title: "Quote total doesn't match the PR",
      detail: `The quote totals ${money(quoteTotal)} but the PR's items (before the 3% card fee) add up to ${money(prSubtotal)}.`,
      suggestion: "Reconcile the PR to the quote — they should match before the fee.",
    });
  } else {
    out.push({
      code: "quote_ok",
      severity: "info",
      title: "Quote matches the PR",
      detail: `Quote total ${money(quoteTotal)} matches the PR before the 3% fee.`,
      suggestion: null,
    });
  }

  const pv = normalizeVendorName(input.prVendor);
  const qv = normalizeVendorName(input.quoteVendor);
  if (pv && qv && pv !== qv) {
    out.push({
      code: "quote_vendor_mismatch",
      severity: "warning",
      title: "Quote vendor differs from the PR",
      detail: `The PR's vendor is "${input.prVendor}" but the quote is from "${input.quoteVendor}".`,
      suggestion: "Confirm the quote belongs to this PR.",
    });
  }
  return out;
}

/** Validate a Section 889. Returns [] when there's no 889 in the bundle. */
export function check889(input: {
  present: boolean;
  compliant: boolean | null;
  expirationDate: string | null;
  name889: string | null;
  prVendor: string | null;
  asOfIso: string;
}): BundleFinding[] {
  if (!input.present) return [];
  const out: BundleFinding[] = [];

  if (input.compliant === false) {
    out.push({
      code: "section_889_noncompliant",
      severity: "error",
      title: "Section 889 is non-compliant",
      detail:
        "The 889 indicates this vendor provides covered telecom equipment, or its SAM.gov registration isn't active.",
      suggestion: "Don't send this up — get a compliant 889 from the vendor.",
    });
  }

  if (input.expirationDate) {
    const days = daysBetween(input.asOfIso, input.expirationDate);
    if (days < 0) {
      out.push({
        code: "section_889_expired",
        severity: "error",
        title: "Section 889 has expired",
        detail: `The 889 expired on ${input.expirationDate}.`,
        suggestion: "Get a current 889 from the vendor before sending this up.",
      });
    } else if (days <= 30) {
      out.push({
        code: "section_889_expiring",
        severity: "warning",
        title: "Section 889 expires soon",
        detail: `The 889 expires on ${input.expirationDate} (${days} day${days === 1 ? "" : "s"} away).`,
        suggestion: "Refresh it with the vendor soon so it doesn't lapse.",
      });
    }
  }

  const pv = normalizeVendorName(input.prVendor);
  const nv = normalizeVendorName(input.name889);
  if (pv && nv && pv !== nv) {
    out.push({
      code: "section_889_vendor_mismatch",
      severity: "warning",
      title: "889 is for a different vendor",
      detail: `The 889 names "${input.name889}" but the PR vendor is "${input.prVendor}".`,
      suggestion: "Make sure the 889 on file matches this vendor.",
    });
  }

  const hasProblem = out.some((f) => f.severity === "error" || f.severity === "warning");
  if (!hasProblem && input.compliant !== false) {
    out.push({
      code: "section_889_ok",
      severity: "info",
      title: "Section 889 is valid",
      detail: input.expirationDate
        ? `Compliant and valid through ${input.expirationDate}.`
        : "Compliant.",
      suggestion: null,
    });
  }
  return out;
}

export interface BundleCheckInput {
  prItems: ReadonlyArray<Lineish>;
  prVendor: string | null;
  quote: { items: ReadonlyArray<Lineish>; vendor: string | null } | null;
  section889: {
    present: boolean;
    compliant: boolean | null;
    expirationDate: string | null;
    name: string | null;
  };
  asOfIso: string;
}

/**
 * Orchestrate the bundle cross-checks. A plain PR-only upload (no quote, no
 * 889) produces NO findings; once either is present it's treated as a bundle
 * and the missing piece is flagged.
 */
export function buildBundleFindings(input: BundleCheckInput): BundleFinding[] {
  const hasQuote = !!input.quote;
  const has889 = input.section889.present;
  if (!hasQuote && !has889) return [];

  const out: BundleFinding[] = [];
  out.push(
    ...checkQuoteAgainstPr({
      prItems: input.prItems,
      prVendor: input.prVendor,
      quoteItems: input.quote?.items ?? null,
      quoteVendor: input.quote?.vendor ?? null,
    }),
  );
  out.push(
    ...check889({
      present: has889,
      compliant: input.section889.compliant,
      expirationDate: input.section889.expirationDate,
      name889: input.section889.name,
      prVendor: input.prVendor,
      asOfIso: input.asOfIso,
    }),
  );

  if (!hasQuote) {
    out.push({
      code: "quote_missing",
      severity: "warning",
      title: "No quote attached",
      detail: "This PR was uploaded with a 889 but no vendor quote.",
      suggestion: "Attach the vendor quote so it can be checked against the PR.",
    });
  }
  if (!has889) {
    out.push({
      code: "section_889_missing",
      severity: "warning",
      title: "No Section 889 attached",
      detail: "This PR was uploaded with a quote but no 889.",
      suggestion: "Attach the vendor's 889 before sending it up.",
    });
  }
  return out;
}

/** Count errors/warnings in a finding list (info doesn't count). */
export function bundleIssueCounts(findings: ReadonlyArray<BundleFinding>): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const f of findings) {
    if (f.severity === "error") errors++;
    else if (f.severity === "warning") warnings++;
  }
  return { errors, warnings };
}
