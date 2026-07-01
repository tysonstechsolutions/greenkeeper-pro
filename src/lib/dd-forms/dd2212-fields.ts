/**
 * NAVCOMPT 2212 (Individual Material / Property listing) field geometry.
 *
 * The official form is an XFA PDF pdf-lib can't fill, so we overlay values onto
 * a 288-DPI raster of the blank (public/templates/dd2212-page-1.png) at the
 * real field positions. Coordinates are PDF points, bottom-left origin, on a
 * 612 x 792 letter page. Header baselines were read from the widget text of a
 * filled example; the item table's grid was measured directly from the blank
 * (row pitch 23.85 pt, column dividers at x 234 / 283.5 / 333 / 400.5).
 */
import type { Align } from "@/lib/reports/form-overlay";

/** A header value drawn on an exact baseline. */
export interface Dd2212HeaderField {
  x: number;
  baseline: number;
  maxW: number;
  align?: Align;
}

export const DD2212_HEADER: Record<string, Dd2212HeaderField> = {
  activity: { x: 292, baseline: 709, maxW: 280, align: "left" },
  date: { x: 287, baseline: 685, maxW: 108, align: "left" },
  sheetNo: { x: 448, baseline: 686, maxW: 32, align: "left" },
  sheetOf: { x: 507, baseline: 690, maxW: 62, align: "left" },
};

/** One item-table column. */
export interface Dd2212Column {
  x: number;
  maxW: number;
  align?: Align;
}

export const DD2212_TABLE = {
  /** Top grid line of the item body (bottom line of the column headers). */
  rowTop: 654.1,
  /** Uniform row height. */
  pitch: 23.85,
  /** Baseline sits this far above each row's bottom grid line. */
  baselineOffset: 5,
  /** Rows before the totals/signature block. */
  maxRows: 24,
  cols: {
    description: { x: 50, maxW: 182, align: "left" as Align },
    units: { x: 234, maxW: 49, align: "center" as Align },
    unitCost: { x: 286, maxW: 45, align: "left" as Align },
    totalValue: { x: 336, maxW: 62, align: "left" as Align },
    reason: { x: 403, maxW: 170, align: "left" as Align },
  },
} as const;

export type Dd2212ColumnKey = keyof typeof DD2212_TABLE.cols;

/** Baseline (pt) for the Nth item row (1-based). */
export function dd2212RowBaseline(n: number): number {
  return DD2212_TABLE.rowTop - n * DD2212_TABLE.pitch + DD2212_TABLE.baselineOffset;
}
