/**
 * "Ready to send up?" — a deterministic verdict for a PR audit.
 *
 * Tracking-only: advancing pending → sent_up is an internal status change (the
 * real approval is an off-app signature + email). The point of this verdict is
 * to consolidate the checks the app already computed (line-item audit findings,
 * quote/889 bundle findings, AI cost-center suggestions) into ONE clear answer
 * — clean / glance-and-send / fix-first — plus a checklist, so the reviewer can
 * trust it instead of re-eyeballing every PR.
 *
 * Pure: reads only the cached findings. The 889-expiry/date logic is already
 * baked into the bundle findings, so no clock is needed here.
 */
import type { AuditFinding } from "./audit";
import type { BundleFinding } from "./bundle-check";

export type ReadinessVerdict = "ready" | "review" | "blocked";
export type CheckStatus = "pass" | "warn" | "fail" | "na";

export interface ReadinessCheck {
  key: string;
  label: string;
  status: CheckStatus;
  /** The worst finding's headline for this check, when not passing. */
  detail?: string;
}

export interface SendUpReadiness {
  verdict: ReadinessVerdict;
  headline: string;
  /** Error-level issues that should be fixed before sending up. */
  blockers: string[];
  /** Warning-level items worth a glance (don't block). */
  warnings: string[];
  /** Optional/advisory items (e.g. AI cost-center suggestions). */
  optional: string[];
  checks: ReadinessCheck[];
}

export interface ReadinessInput {
  auditFindings: AuditFinding[];
  bundleFindings: BundleFinding[];
  /** Number of AI cost-center suggestions (fit_findings.length). */
  fitCount: number;
}

type Finding = { code: string; severity: string; title: string };

/** Worst status among findings whose code is in `codes`. */
function checkTile(
  key: string,
  label: string,
  findings: Finding[],
  codes: ReadonlySet<string>,
  whenEmpty: CheckStatus,
): ReadinessCheck {
  const matching = findings.filter((f) => codes.has(f.code));
  const err = matching.find((f) => f.severity === "error");
  if (err) return { key, label, status: "fail", detail: err.title };
  const warn = matching.find((f) => f.severity === "warning");
  if (warn) return { key, label, status: "warn", detail: warn.title };
  if (matching.length > 0) return { key, label, status: "pass" }; // an info/_ok note
  return { key, label, status: whenEmpty };
}

const CODE_TILES = {
  codes: new Set(["invalid_site", "invalid_cost_center", "invalid_gl_account", "no_items"]),
  totals: new Set(["grand_total_mismatch", "line_math"]),
  fee: new Set(["cc_fee_duplicate", "cc_fee_amount", "cc_fee_rate", "cc_fee_not_last", "sales_tax_duplicate"]),
  quote: new Set(["quote_total_mismatch", "quote_vendor_mismatch", "quote_missing", "quote_unreadable", "quote_ok"]),
  section889: new Set([
    "section_889_expired",
    "section_889_noncompliant",
    "section_889_expiring",
    "section_889_vendor_mismatch",
    "section_889_unreadable",
    "section_889_missing",
    "section_889_ok",
  ]),
} as const;

export function computeSendUpReadiness(input: ReadinessInput): SendUpReadiness {
  const { auditFindings, bundleFindings, fitCount } = input;
  const all: Finding[] = [...auditFindings, ...bundleFindings];

  const errors = all.filter((f) => f.severity === "error");
  const warnings = all.filter((f) => f.severity === "warning");

  const verdict: ReadinessVerdict =
    errors.length > 0 ? "blocked" : warnings.length > 0 || fitCount > 0 ? "review" : "ready";

  const checks: ReadinessCheck[] = [
    checkTile("codes", "Site / cost center / GL codes", auditFindings, CODE_TILES.codes, "pass"),
    checkTile("totals", "Totals reconcile", auditFindings, CODE_TILES.totals, "pass"),
    checkTile("fee", "Credit-card fee & tax", auditFindings, CODE_TILES.fee, "pass"),
    checkTile("quote", "Quote matches PR", bundleFindings, CODE_TILES.quote, "na"),
    checkTile("section889", "Section 889", bundleFindings, CODE_TILES.section889, "na"),
    {
      key: "fit",
      label: "Cost-center fit (AI)",
      status: fitCount > 0 ? "warn" : "pass",
      detail: fitCount > 0 ? `${fitCount} suggestion${fitCount > 1 ? "s" : ""}` : undefined,
    },
  ];

  const optional =
    fitCount > 0
      ? [`${fitCount} cost-center suggestion${fitCount > 1 ? "s" : ""} to review (optional)`]
      : [];

  let headline: string;
  if (verdict === "blocked") {
    headline = `${errors.length} issue${errors.length > 1 ? "s" : ""} to fix before sending up.`;
  } else if (verdict === "review") {
    const n = warnings.length + (fitCount > 0 ? 1 : 0);
    headline = `Looks good — ${n} item${n > 1 ? "s" : ""} to glance at, then send up.`;
  } else {
    headline = "Clean — ready to send up.";
  }

  return {
    verdict,
    headline,
    blockers: errors.map((f) => f.title),
    warnings: warnings.map((f) => f.title),
    optional,
    checks,
  };
}
