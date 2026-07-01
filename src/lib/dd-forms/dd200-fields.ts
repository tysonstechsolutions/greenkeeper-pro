/**
 * DD Form 200 (Financial Liability Investigation of Property Loss) field
 * geometry. Overlaid onto 288-DPI rasters of the blank (public/templates/
 * dd200-page-{1,2}.png). Coordinates are PDF points, bottom-left origin, on a
 * 612 x 792 letter page — read from the widget text of a filled example.
 *
 * Fill scope is the INITIATOR's portion (blocks 1-11 on page 1). Blocks 12-14
 * (reviewing / appointing / approving authorities) and all of page 2 (the
 * financial-liability officer's findings) are signed up the chain and left
 * blank, exactly like the SF-52 filler leaves the HR-coded sections blank.
 */
import type { Align, OverlayBox } from "@/lib/reports/form-overlay";

/** Single line drawn on an exact baseline. */
export interface Dd200Line {
  x: number;
  baseline: number;
  maxW: number;
  align?: Align;
}

// Dates, quantity, and costs are centered within their form cell — the XFA
// original centers them, so a fixed left offset looked off (e.g. block 11e
// date signed sat too far left). x + maxW spans the cell; align "center".
export const DD200_LINES: Record<string, Dd200Line> = {
  dateInitiated: { x: 40, baseline: 695, maxW: 167, align: "center" },
  inquiryNumber: { x: 208, baseline: 695, maxW: 221, align: "center" },
  dateLossDiscovered: { x: 460, baseline: 695, maxW: 115, align: "center" },
  nsn: { x: 42, baseline: 664, maxW: 100, align: "left" },
  itemDescription: { x: 148, baseline: 664, maxW: 205, align: "left" },
  quantity: { x: 358, baseline: 662, maxW: 71, align: "center" },
  unitCost: { x: 430, baseline: 662, maxW: 71, align: "center" },
  totalCost: { x: 502, baseline: 662, maxW: 73, align: "center" },
  // Block 11 — individual completing blocks 1-10.
  typedName: { x: 244, baseline: 434, maxW: 215, align: "left" },
  dsn: { x: 466, baseline: 434, maxW: 109, align: "center" },
  dateSigned: { x: 466, baseline: 407, maxW: 109, align: "center" },
};

export type Dd200LineKey = keyof typeof DD200_LINES;

/** Multi-line wrapped boxes (narratives + org address). */
export const DD200_BOXES: Record<string, OverlayBox> = {
  circumstances: { x: 40, y: 554, w: 528, h: 70, multiline: true },
  actions: { x: 40, y: 468, w: 528, h: 64, multiline: true },
  orgAddress: { x: 40, y: 400, w: 200, h: 40, multiline: true },
};

export type Dd200BoxKey = keyof typeof DD200_BOXES;

/** Block-9 "(X one)" marks — bold X drawn at this baseline/left edge. */
export interface Dd200Check {
  x: number;
  baseline: number;
}

/** Type of loss (top row of block 9). */
export const DD200_CIRCUMSTANCE_CHECKS: Record<"lost" | "damaged" | "destroyed", Dd200Check> = {
  lost: { x: 365, baseline: 646 },
  damaged: { x: 437, baseline: 646 },
  destroyed: { x: 509, baseline: 646 },
};

/** Property category (bottom row of block 9). */
export const DD200_CATEGORY_CHECKS: Record<"organization" | "installation" | "ocie", Dd200Check> = {
  organization: { x: 365, baseline: 634 },
  installation: { x: 437, baseline: 634 },
  ocie: { x: 509, baseline: 634 },
};

/** Standing golf-course organization address (block 11a), pre-filled. */
export const DD200_ORG_ADDRESS = "MWR, N92\n2601E PAUL JONES STREET\nBLDG 1\nGREAT LAKES, IL 60088";
