/**
 * STI SP001 Monthly Inspection Checklist — fixed item catalog.
 *
 * Single source of truth shared by:
 *   • the inspection form  (src/app/ast-inspections/new/page.tsx)
 *   • the detail / view UI (src/app/ast-inspections/view/page.tsx)
 *   • the PDF generator    (src/lib/reports/ast-inspection-report.ts)
 *
 * Order, numbering, section labels, allowed statuses, and the inverted
 * polarity on item 16 are all dictated by the SP001 standard. Don't reorder.
 */

import { formatLocalDate } from "@/lib/utils/date";
import type { AstInspectionItems } from "@/types/database";

export type AstSection =
  | "Tank and Piping"
  | "Equipment on tank"
  | "Containment (Diking/Impounding)"
  | "Concrete Exterior AST (CE-AST)"
  | "Other Conditions";

export interface AstInspectionItemDef {
  /** 1-19, used as the JSON key on the row's `items` column. */
  number: number;
  section: AstSection;
  /** The question shown on the form / printed on the PDF. */
  prompt: string;
  /** Optional sub-line shown under the prompt (e.g. "If 'No', identify..."). */
  note?: string;
  /** Whether N/A is a valid answer. Three items in section 1 are Yes/No only. */
  allowsNa: boolean;
  /**
   * Item 16 is the only item where YES is the bad answer ("are there any
   * cracks larger than 1/16"?"). The form annotates this with an asterisk
   * and the PDF renders it likewise — this flag drives both.
   */
  yesIsNonConforming?: boolean;
}

export const AST_INSPECTION_ITEMS: AstInspectionItemDef[] = [
  // ── Tank and Piping ──────────────────────────────────────────────────────
  {
    number: 1,
    section: "Tank and Piping",
    prompt:
      "Is tank exterior (roof, shell, heads, bottom, connections, fittings, valves, etc.) free of visible leaks?",
    note: 'If "No", identify tank and describe leak and actions taken.',
    allowsNa: false,
  },
  {
    number: 2,
    section: "Tank and Piping",
    prompt: "Is the tank liquid level gauge legible and in good working condition?",
    allowsNa: true,
  },
  {
    number: 3,
    section: "Tank and Piping",
    prompt:
      "Is the area around the tank (concrete surfaces, ground, containment, etc.) free of visible signs of leakage?",
    allowsNa: false,
  },
  {
    number: 4,
    section: "Tank and Piping",
    prompt:
      "Is tank shell or supports free of soil, vegetation, water, or foreign material collected or covering the grade line (tank chime or bottom projection)?",
    allowsNa: true,
  },
  {
    number: 5,
    section: "Tank and Piping",
    prompt:
      "Is the primary tank free of water or has another preventative measure been taken?",
    note:
      "Refer to paragraphs 6.10 and 6.11 of the standard for alternatives for Category 1 tanks. N/A is only appropriate for these alternatives.",
    allowsNa: true,
  },
  {
    number: 6,
    section: "Tank and Piping",
    prompt:
      "For double-wall or double bottom tanks or CE-ASTs, is interstitial monitoring equipment (where applicable) in good working condition?",
    allowsNa: true,
  },
  {
    number: 7,
    section: "Tank and Piping",
    prompt:
      "For double-wall tanks or double bottom tanks or CE-ASTs, is interstice free of liquid?",
    note:
      "Remove the liquid if it is found. If tank product is found, investigate possible leak.",
    allowsNa: true,
  },

  // ── Equipment on tank ────────────────────────────────────────────────────
  {
    number: 8,
    section: "Equipment on tank",
    prompt:
      'If overfill equipment has a "test" button, does it activate the audible horn or light to confirm operation?',
    note: "If battery operated, replace battery if needed.",
    allowsNa: true,
  },
  {
    number: 9,
    section: "Equipment on tank",
    prompt: "Is overfill prevention equipment in good working condition?",
    note:
      "If it is equipped with a mechanical test mechanism, actuate the mechanism to confirm operation.",
    allowsNa: true,
  },
  {
    number: 10,
    section: "Equipment on tank",
    prompt:
      "Is the spill container (spill bucket) empty, free of visible leaks and in good working condition?",
    allowsNa: true,
  },
  {
    number: 11,
    section: "Equipment on tank",
    prompt:
      "Are piping connections to the tank (valves, fittings, pumps, etc.) free of visible leaks?",
    note: 'If "No", identify location and describe leak.',
    allowsNa: false,
  },
  {
    number: 12,
    section: "Equipment on tank",
    prompt:
      "Do the ladders/platforms/walkways appear to be secure with no sign of severe corrosion or damage?",
    allowsNa: true,
  },

  // ── Containment ──────────────────────────────────────────────────────────
  {
    number: 13,
    section: "Containment (Diking/Impounding)",
    prompt:
      "Is the containment free of excess liquid, debris, cracks, corrosion, erosion, fire hazards and other integrity issues?",
    allowsNa: true,
  },
  {
    number: 14,
    section: "Containment (Diking/Impounding)",
    prompt: "Are dike drain valves closed and in good working condition?",
    allowsNa: true,
  },
  {
    number: 15,
    section: "Containment (Diking/Impounding)",
    prompt: "Are containment egress pathways clear and any gates/doors operable?",
    allowsNa: true,
  },

  // ── Concrete Exterior AST (CE-AST) ───────────────────────────────────────
  {
    number: 16,
    section: "Concrete Exterior AST (CE-AST)",
    prompt:
      'Inspect all sides for cracks in concrete. Are there any cracks in the concrete exterior larger than 1/16"?',
    allowsNa: true,
    // SP001 inverts this one: YES means the concrete is cracked, which is bad.
    yesIsNonConforming: true,
  },
  {
    number: 17,
    section: "Concrete Exterior AST (CE-AST)",
    prompt:
      "Inspect concrete exterior body of the tank for cleanliness, need of coating, or rusting where applicable. Tank exterior in acceptable condition?",
    allowsNa: true,
  },
  {
    number: 18,
    section: "Concrete Exterior AST (CE-AST)",
    prompt:
      "Visual inspect all tank top openings including nipples, manways, tank top spill containers, and leak detection tubes. Is the sealant between all tank top openings and concrete intact and in good condition?",
    allowsNa: true,
  },

  // ── Other Conditions ─────────────────────────────────────────────────────
  {
    number: 19,
    section: "Other Conditions",
    prompt:
      "Is the system free of any other conditions that need to be addressed for continued safe operation?",
    allowsNa: false,
  },
];

export const AST_SECTIONS: AstSection[] = [
  "Tank and Piping",
  "Equipment on tank",
  "Containment (Diking/Impounding)",
  "Concrete Exterior AST (CE-AST)",
  "Other Conditions",
];

/**
 * True if the answer is a non-conformance for SP001 reporting.
 *
 *   normal items: status === "no"  → non-conforming
 *   item 16:      status === "yes" → non-conforming
 */
export function isNonConforming(
  item: AstInspectionItemDef,
  status: "yes" | "no" | "na" | null,
): boolean {
  if (status === "na" || status === null) return false;
  if (item.yesIsNonConforming) return status === "yes";
  return status === "no";
}

/**
 * Given an inspection_date, compute the SP001-mandated 36-month retention
 * date. Used both at insert time (DB column) and on the printed PDF header.
 */
export function computeRetainUntilDate(inspectionDate: string): string {
  const d = new Date(inspectionDate);
  d.setMonth(d.getMonth() + 36);
  return formatLocalDate(d);
}

/**
 * Tank-type presets. SP001 requires a separate inspection per tank category,
 * so the user picks one of these at the start of every monthly form.
 *
 * Each preset auto-fills the "Tank(s) Inspected ID" field. The user can
 * still override the IDs by hand if a tank is added/decommissioned.
 *
 * Gasoline and diesel each get their own inspection — SP001 treats different
 * products in different tanks as separate inspections even when the tanks
 * sit on the same containment pad.
 */
export type AstTankType = "gasoline" | "diesel" | "used_cooking_oil";

export const AST_TANK_TYPES: Record<
  AstTankType,
  { label: string; tankIds: string }
> = {
  gasoline: {
    label: "Gasoline AST",
    tankIds: "3311-01A",
  },
  diesel: {
    label: "Diesel AST",
    tankIds: "3311-02A",
  },
  used_cooking_oil: {
    label: "Used Cooking Oil AST",
    tankIds: "8400-01UCO",
  },
};

/**
 * Legacy single-string default — kept so existing callers don't break.
 * New code should use AST_TANK_TYPES[type].tankIds instead.
 */
export const DEFAULT_TANK_IDS = AST_TANK_TYPES.gasoline.tankIds;

/**
 * Infer the tank type from a saved `tank_ids` string. Used in edit mode to
 * reflect the right selection in the Tank Type picker.
 *
 * Legacy records may have both 3311-01A and 3311-02A in one row (the old
 * combined "Fuel AST" inspection); those fall through to gasoline so the
 * picker still resolves to something sensible.
 */
export function inferTankType(tankIds: string): AstTankType {
  const ids = tankIds.toLowerCase();
  if (ids.includes("uco") || ids.includes("cooking")) return "used_cooking_oil";
  if (ids.includes("02a")) return "diesel";
  return "gasoline";
}

/**
 * Build a fully-answered items map representing a "pass" inspection — every
 * item set to its conforming answer. Used by the Quick Pass PDF flow so the
 * user can skip the 19-click form when nothing is wrong.
 *
 * Items 1-15, 17-19 → "yes". Item 16 → "no" (it's the only item where YES is
 * the bad answer — "any cracks larger than 1/16"?").
 */
export function getDefaultPassItems(): AstInspectionItems {
  const out: AstInspectionItems = {};
  for (const def of AST_INSPECTION_ITEMS) {
    out[String(def.number)] = {
      status: def.yesIsNonConforming ? "no" : "yes",
      comment: null,
    };
  }
  return out;
}
