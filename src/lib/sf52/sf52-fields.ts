/**
 * SF-52 (Request for Personnel Action) field coordinate map.
 *
 * The official OPM form is a LiveCycle/XFA PDF that pdf-lib can't open, so we
 * overlay values onto a high-DPI image of the real form (public/templates/
 * sf52-page-{1,2}.png) at the exact field positions. These rects were
 * extracted from the form's widget annotations (origin bottom-left, PDF
 * points; both pages are standard 612 x 792 letter).
 *
 * Only the boxes the *requesting office* fills are listed (per the SF-52 Desk
 * Guide). SSN/DOB, nature-of-action/legal-authority codes, the approval and
 * signature blocks, and the rest of the coded HR fields are deliberately
 * omitted — HR/N92 completes those.
 */

export interface Sf52Box {
  page: 1 | 2;
  /** Box bottom-left x (pt). */
  x: number;
  /** Box bottom-left y (pt). */
  y: number;
  /** Box width (pt). */
  w: number;
  /** Box height (pt). */
  h: number;
  /** Wrap text across multiple lines (for the tall remark/location boxes). */
  multiline?: boolean;
}

export const SF52_PAGE_W = 612;
export const SF52_PAGE_H = 792;

export const SF52_BOXES = {
  // ── Part A — Requesting Office ──────────────────────────────────────────
  actionsRequested: { page: 1, x: 25.15, y: 697.81, w: 473.23, h: 13.48 },
  addlInfoName: { page: 1, x: 25.55, y: 673.88, w: 302.5, h: 15.92 },
  addlInfoPhone: { page: 1, x: 338.25, y: 673.69, w: 150.0, h: 15.51 },
  proposedEffectiveDate: { page: 1, x: 503.76, y: 672.72, w: 86.64, h: 15.48 },

  // ── Part B — identity + FROM/TO position ────────────────────────────────
  fullName: { page: 1, x: 23.93, y: 602.09, w: 279.78, h: 14.7 },

  fromPositionTitleNo: { page: 1, x: 22.32, y: 468.72, w: 285.12, h: 39.96, multiline: true },
  toPositionTitleNo: { page: 1, x: 312.24, y: 468.72, w: 277.32, h: 39.96, multiline: true },

  fromPayPlan: { page: 1, x: 22.31, y: 445.54, w: 34.41, h: 13.89 },
  fromOccCode: { page: 1, x: 58.41, y: 445.21, w: 34.42, h: 14.29 },
  fromGrade: { page: 1, x: 94.33, y: 445.8, w: 47.39, h: 13.89 },
  fromStep: { page: 1, x: 144.39, y: 445.21, w: 43.74, h: 14.29 },
  fromTotalSalary: { page: 1, x: 191.22, y: 445.21, w: 76.18, h: 15.11 },
  fromPayBasis: { page: 1, x: 270.75, y: 445.2, w: 36.84, h: 14.3 },

  toPayPlan: { page: 1, x: 311.85, y: 446.06, w: 33.6, h: 13.89 },
  toOccCode: { page: 1, x: 346.95, y: 445.84, w: 34.42, h: 14.29 },
  toGrade: { page: 1, x: 383.82, y: 445.47, w: 45.37, h: 13.89 },
  toStep: { page: 1, x: 432.27, y: 444.88, w: 44.14, h: 14.7 },
  toTotalSalary: { page: 1, x: 479.5, y: 445.11, w: 75.78, h: 14.7 },
  toPayBasis: { page: 1, x: 557.28, y: 445.72, w: 33.12, h: 14.8 },

  fromPositionLocation: { page: 1, x: 22.56, y: 347.88, w: 284.88, h: 65.08, multiline: true },
  toPositionLocation: { page: 1, x: 312.24, y: 347.88, w: 277.08, h: 65.04, multiline: true },

  // ── Employee / Position data (only the requesting-office boxes) ──────────
  workSchedule: { page: 1, x: 313.82, y: 267.06, w: 185.69, h: 13.48 },
  ptHours: { page: 1, x: 503.81, y: 264.44, w: 29.14, h: 17.14 },
  flsa: { page: 1, x: 221.09, y: 227.98, w: 21.03, h: 15.51 },
  appropriationCode: { page: 1, x: 311.71, y: 229.64, w: 188.94, h: 15.11 },
  dutyStationCode: { page: 1, x: 21.96, y: 206.56, w: 192.84, h: 14.34 },
  dutyStation: { page: 1, x: 216.36, y: 206.56, w: 373.32, h: 13.93 },
  vice: { page: 1, x: 273.75, y: 180.8, w: 77.0, h: 15.1 },

  // ── Part D — Remarks by Requesting Office (recruitments) ────────────────
  numRecruitments: { page: 2, x: 131.0, y: 700.65, w: 360.89, h: 22.0 },
  areasOfConsideration: { page: 2, x: 161.42, y: 676.72, w: 330.47, h: 22.0 },
  proposedSalaryRange: { page: 2, x: 202.78, y: 651.98, w: 289.93, h: 22.0 },
  relocationAuth: { page: 2, x: 163.85, y: 627.02, w: 328.45, h: 22.0 },
  otherNotes: { page: 2, x: 104.23, y: 592.77, w: 388.07, h: 32.13, multiline: true },

  // ── Part E — Employee Resignation/Retirement ────────────────────────────
  reasonForResign: { page: 2, x: 22.31, y: 297.11, w: 563.27, h: 134.74, multiline: true },
  partEEffectiveDate: { page: 2, x: 22.08, y: 251.88, w: 55.8, h: 28.8, multiline: true },
  dateSigned: { page: 2, x: 252.72, y: 251.88, w: 55.68, h: 28.8 },
  forwardingAddress: { page: 2, x: 310.68, y: 251.88, w: 276.45, h: 28.8, multiline: true },

  // ── Part F — Remarks for SF 50 (other actions) ──────────────────────────
  partFRemarks: { page: 2, x: 23.12, y: 45.25, w: 564.08, h: 184.22, multiline: true },
} as const satisfies Record<string, Sf52Box>;

export type Sf52BoxKey = keyof typeof SF52_BOXES;

/** Part D Yes/No: "Do you know of additional or conflicting reasons...?" */
export const SF52_CHECKBOXES = {
  conflictingReasonsYes: { page: 2, x: 501.28, y: 727.36, w: 18.0, h: 18.0 },
  conflictingReasonsNo: { page: 2, x: 544.27, y: 726.95, w: 18.0, h: 18.0 },
} as const;
