/**
 * Deterministic match of a parsed receipt against a PR's submitted line items.
 * Pure functions (no AI, no I/O) so the reconciliation UI shows a reproducible
 * "does it all match?" verdict and this stays unit-testable.
 *
 * The AI only READS the receipt (see receipt-extract.ts). The comparison —
 * what counts as a price difference, a missing item, an extra charge — is
 * decided here, in code, so it never drifts.
 */
import type { PurchaseRequestItem } from "@/types/database";
import type { ExtractedReceipt, ExtractedReceiptItem } from "./receipt-extract";

export type LineStatus =
  | "match"
  | "price_diff"
  | "qty_diff"
  | "missing_on_receipt"
  | "extra_on_receipt";

export interface MatchedLine {
  status: LineStatus;
  description: string;
  prQty: number | null;
  prUnitPrice: number | null;
  receiptQty: number | null;
  receiptUnitPrice: number | null;
  note: string;
}

export interface ReceiptMatch {
  lines: MatchedLine[];
  /** Count of lines that are anything other than a clean match. */
  differences: number;
  /** The receipt's grand total (from the AI), rounded to cents, or null. */
  receiptTotal: number | null;
}

const PRICE_TOLERANCE = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lowercase, strip punctuation, collapse whitespace → token set. */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1),
  );
}

/** Jaccard similarity of two token sets (0..1). */
function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

const MATCH_THRESHOLD = 0.34;

/**
 * Compare a receipt's line items against the PR's submitted items. Greedy
 * best-match by description similarity; leftover PR items are "missing on
 * receipt", leftover receipt items are "extra on receipt" (tax lines, fees,
 * substitutions). Matched pairs are checked for price and quantity drift.
 */
export function matchReceiptToPr(
  prItems: PurchaseRequestItem[],
  receipt: ExtractedReceipt,
): ReceiptMatch {
  const receiptItems = receipt.items;
  const receiptTokens = receiptItems.map((it) => tokenize(it.description));
  const usedReceipt = new Set<number>();
  const lines: MatchedLine[] = [];

  for (const prItem of prItems) {
    const prTokens = tokenize(prItem.description || "");
    const prQty = Number(prItem.qty) || 0;
    const prUnit = Number(prItem.unit_price) || 0;

    // Find the most similar unused receipt line above the threshold.
    let bestIdx = -1;
    let bestScore = MATCH_THRESHOLD;
    for (let i = 0; i < receiptItems.length; i++) {
      if (usedReceipt.has(i)) continue;
      const score = similarity(prTokens, receiptTokens[i]);
      if (score >= bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      lines.push({
        status: "missing_on_receipt",
        description: prItem.description || "(item)",
        prQty,
        prUnitPrice: prUnit,
        receiptQty: null,
        receiptUnitPrice: null,
        note: "On the PR but not found on the receipt",
      });
      continue;
    }

    usedReceipt.add(bestIdx);
    const rItem: ExtractedReceiptItem = receiptItems[bestIdx];
    const priceDiff = Math.abs(rItem.unit_price - prUnit) > PRICE_TOLERANCE;
    const qtyDiff = Math.abs(rItem.qty - prQty) > 0.001;

    let status: LineStatus = "match";
    let note = "Matches the PR";
    if (priceDiff) {
      status = "price_diff";
      const dir = rItem.unit_price > prUnit ? "higher" : "lower";
      note = `Unit price ${dir}: PR $${round2(prUnit)} vs receipt $${round2(rItem.unit_price)}`;
    } else if (qtyDiff) {
      status = "qty_diff";
      note = `Quantity differs: PR ${prQty} vs receipt ${rItem.qty}`;
    }

    lines.push({
      status,
      description: prItem.description || rItem.description,
      prQty,
      prUnitPrice: prUnit,
      receiptQty: rItem.qty,
      receiptUnitPrice: rItem.unit_price,
      note,
    });
  }

  // Any receipt line never matched to a PR item is an extra charge.
  for (let i = 0; i < receiptItems.length; i++) {
    if (usedReceipt.has(i)) continue;
    const rItem = receiptItems[i];
    lines.push({
      status: "extra_on_receipt",
      description: rItem.description,
      prQty: null,
      prUnitPrice: null,
      receiptQty: rItem.qty,
      receiptUnitPrice: rItem.unit_price,
      note: "On the receipt but not on the PR",
    });
  }

  const differences = lines.filter((l) => l.status !== "match").length;
  return {
    lines,
    differences,
    receiptTotal: receipt.total != null ? round2(receipt.total) : null,
  };
}

/** Human summary label for the match verdict. */
export function matchSummary(match: ReceiptMatch): string {
  if (match.lines.length === 0) return "No line items to compare";
  if (match.differences === 0) return "Everything matches the PR";
  return `${match.differences} difference${match.differences === 1 ? "" : "s"} vs the PR`;
}
