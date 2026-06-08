/**
 * AI cost-center "fit" check.
 *
 * The deterministic audit (audit.ts) only checks that a Site / Cost Center /
 * G/L code is on the approved list. This check goes further: given each line
 * item and the boss-maintained cost-center reference (description + example
 * items), it asks Claude whether the cost center chosen on the PR is the RIGHT
 * one for what was bought, and suggests a better one when it isn't.
 *
 * It is purely ADVISORY — suggestions with reasons, never a hard block. It runs
 * on demand (when a PR is opened / via a Re-check button), not on every edit,
 * because it costs an API round-trip. Results are stored on pr_audits.fit_*.
 */
import { callApi } from "@/lib/api/client";

/** One advisory suggestion that a line's cost center may be wrong. */
export interface FitFinding {
  /** 0-based line index this is about. */
  itemIndex: number;
  /** The cost center currently on the line. */
  currentCode: string | null;
  /** The cost center the AI thinks fits better (null if it only flags doubt). */
  suggestedCode: string | null;
  /** Plain-English reason. */
  reason: string;
}

/** A cost center's reference info the AI grades against. */
export interface FitReferenceCostCenter {
  code: string;
  label: string;
  description: string | null;
  examples: string | null;
}

/** A line item handed to the fit check. */
export interface FitCheckItem {
  index: number;
  description: string;
  cost_ctr: string | null;
}

interface FitCheckResponse {
  findings?: Array<{
    itemIndex?: number;
    currentCode?: string | null;
    suggestedCode?: string | null;
    reason?: string;
  }> | null;
}

function isValidCode(codes: Set<string>, c: unknown): c is string {
  return typeof c === "string" && codes.has(c);
}

/**
 * Run the AI fit-check. Returns [] (no API call) when there's nothing to judge
 * against — i.e. no cost center has a description/examples filled in, or there
 * are no items. Findings referencing unknown suggested codes are dropped.
 */
export async function runFitCheck(
  items: FitCheckItem[],
  costCenters: FitReferenceCostCenter[],
): Promise<FitFinding[]> {
  const usableRef = costCenters.filter(
    (c) => (c.description || "").trim() || (c.examples || "").trim(),
  );
  const realItems = items.filter((it) => (it.description || "").trim());
  if (usableRef.length === 0 || realItems.length === 0) return [];

  const validCodes = new Set(costCenters.map((c) => c.code));

  const raw = await callApi<FitCheckResponse>("audit-pr-fit", {
    method: "POST",
    body: { items: realItems, cost_centers: costCenters },
  });

  const out: FitFinding[] = [];
  for (const f of raw?.findings ?? []) {
    if (typeof f.itemIndex !== "number") continue;
    if (!f.reason || !f.reason.trim()) continue;
    out.push({
      itemIndex: f.itemIndex,
      currentCode: typeof f.currentCode === "string" ? f.currentCode : null,
      // Only keep a suggestion if it's a real, known cost-center code.
      suggestedCode: isValidCode(validCodes, f.suggestedCode)
        ? f.suggestedCode
        : null,
      reason: f.reason.trim(),
    });
  }
  return out;
}
