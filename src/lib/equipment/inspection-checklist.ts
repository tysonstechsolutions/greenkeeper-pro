/**
 * Triage / condition inspection — Phase B (data-incomplete mode).
 *
 * A simple structured inspection that can be completed from CURRENT observations,
 * without any manufacturer manual. It never prescribes make/model-specific
 * service actions. Every item may be left "unknown" (not checked). Stored in the
 * existing `equipment_inspections.checklist_items` JSONB with
 * `inspection_type = 'triage'`, so it never collides with the pre/post-op forms.
 * Pure module: no I/O.
 */

export type TriageCheckValue = "ok" | "issue" | "unknown" | "na";

export interface TriageChecklistEntry {
  id: TriageCheckItemId;
  value: TriageCheckValue;
  note?: string;
}

export type TriageCheckItemId =
  | "starts_runs"
  | "leaks_observed"
  | "tires"
  | "belts_hoses"
  | "guards"
  | "cutting_units"
  | "battery"
  | "visible_damage"
  | "fluids_checked"
  | "meter_visible";

export interface TriageCheckItemMeta {
  id: TriageCheckItemId;
  label: string;
  /** For items where "issue" means a problem (most) vs. informational. */
  hint: string;
}

/**
 * The canonical item catalog. Terra renders exactly these; each defaults to
 * "unknown" (not checked) until a person sets it.
 */
export const TRIAGE_CHECK_ITEMS: readonly TriageCheckItemMeta[] = [
  { id: "starts_runs",    label: "Starts / runs",        hint: "Does the engine start and run?" },
  { id: "leaks_observed", label: "Leaks observed",       hint: "Any visible fluid leaks?" },
  { id: "tires",          label: "Tires",                hint: "Inflated / not flat / not damaged." },
  { id: "belts_hoses",    label: "Belts & hoses",        hint: "Intact, not cracked or loose." },
  { id: "guards",         label: "Guards",               hint: "Safety guards present and secure." },
  { id: "cutting_units",  label: "Cutting units",        hint: "Reels/blades present and undamaged." },
  { id: "battery",        label: "Battery",              hint: "Present, connected, holds charge." },
  { id: "visible_damage", label: "Visible damage",       hint: "Any obvious structural damage?" },
  { id: "fluids_checked", label: "Fluid checks done",    hint: "Oil/coolant/hydraulic levels looked at." },
  { id: "meter_visible",  label: "Hour meter visible",   hint: "Is an hour meter readable on the unit?" },
] as const;

const ITEM_IDS = new Set<string>(TRIAGE_CHECK_ITEMS.map((i) => i.id));

/** For most items an "issue" is a problem; for "leaks_observed" an issue = a leak was seen. */
const ISSUE_MEANS_PROBLEM: Record<TriageCheckItemId, boolean> = {
  starts_runs: true,
  leaks_observed: true,
  tires: true,
  belts_hoses: true,
  guards: true,
  cutting_units: true,
  battery: true,
  visible_damage: true,
  fluids_checked: false, // informational — "issue" is not used here
  meter_visible: false, // informational — presence, not condition
};

export function isTriageCheckItemId(id: string): id is TriageCheckItemId {
  return ITEM_IDS.has(id);
}

/** A fresh checklist with every item "unknown" (not checked). */
export function emptyTriageChecklist(): TriageChecklistEntry[] {
  return TRIAGE_CHECK_ITEMS.map((i) => ({ id: i.id, value: "unknown" as const }));
}

export interface TriageChecklistSummary {
  /** Maps to the existing equipment_inspections.overall_status enum. */
  overall: "pass" | "needs_attention" | "fail";
  issues: TriageCheckItemId[];
  checkedCount: number;
  totalCount: number;
  meterVisible: boolean | null; // null = not checked
}

/**
 * Derive a conservative overall status. Deterministic; never invents.
 * - Any genuine problem-item marked "issue" → "needs_attention".
 * - Nothing checked at all → "needs_attention" (an empty inspection isn't a pass).
 * - Otherwise → "pass".
 * We do not auto-produce "fail"; a person selects that explicitly at save time
 * if the unit is unusable. (Terra passes it through.)
 */
export function summarizeTriageChecklist(entries: readonly TriageChecklistEntry[]): TriageChecklistSummary {
  const issues: TriageCheckItemId[] = [];
  let checkedCount = 0;
  let meterVisible: boolean | null = null;

  for (const e of entries) {
    if (!isTriageCheckItemId(e.id)) continue;
    if (e.value !== "unknown") checkedCount += 1;
    if (e.id === "meter_visible") {
      meterVisible = e.value === "ok" ? true : e.value === "issue" ? false : null;
    }
    if (e.value === "issue" && ISSUE_MEANS_PROBLEM[e.id]) issues.push(e.id);
  }

  const overall: TriageChecklistSummary["overall"] =
    issues.length > 0 ? "needs_attention" : checkedCount === 0 ? "needs_attention" : "pass";

  return {
    overall,
    issues,
    checkedCount,
    totalCount: TRIAGE_CHECK_ITEMS.length,
    meterVisible,
  };
}
