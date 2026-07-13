/**
 * Equipment data-completeness assessment — Phase B (data-incomplete mode).
 *
 * Reports, per unit and in totals, which information is RECORDED vs NOT RECORDED.
 * A missing value is "not recorded" — never treated as zero, and never inferred.
 * Also produces a prioritized collection queue of what to gather next. This is a
 * queue, not a blocker. Pure module: no I/O.
 */

import { isDiagnosed, type TriageStatus } from "./triage";

export type CompletenessField =
  | "photo"
  | "make"
  | "model"
  | "serial"
  | "meter"
  | "pm_schedule"
  | "recent_inspection"
  | "service_history"
  | "repair_diagnosis"
  | "parts_info";

export const COMPLETENESS_FIELDS: readonly { field: CompletenessField; label: string }[] = [
  { field: "photo", label: "Photo" },
  { field: "make", label: "Make" },
  { field: "model", label: "Model" },
  { field: "serial", label: "Serial number" },
  { field: "meter", label: "Meter reading" },
  { field: "pm_schedule", label: "PM schedule" },
  { field: "recent_inspection", label: "Recent inspection" },
  { field: "service_history", label: "Service history" },
  { field: "repair_diagnosis", label: "Repair diagnosis" },
  { field: "parts_info", label: "Parts information" },
] as const;

/** The equipment fields this assessment reads (kept narrow on purpose). */
export interface CompletenessUnitInput {
  id: string;
  name: string;
  status: string; // equipment.status (source of truth)
  make: string | null;
  model: string | null;
  serial_number: string | null;
  photo_url: string | null;
  photos: string[] | null;
  current_hours: number | null;
  service_interval_hours: number | null;
  needs_parts_ordered: boolean | null;
  parts_needed: string | null;
  last_inspection_date: string | null;
  triage_status: TriageStatus | null;
}

/** Related-row counts the caller supplies (from service records / parts). */
export interface CompletenessRelated {
  serviceRecordCount: number;
  partsCount: number;
}

const DOWN_STATUSES = new Set(["out_of_service", "in_repair", "needs_service"]);
const RECENT_INSPECTION_DAYS = 90;

export interface UnitCompleteness {
  id: string;
  name: string;
  /** field → true when the information is recorded. */
  present: Record<CompletenessField, boolean>;
  /** Fields that are relevant but not recorded. */
  missing: CompletenessField[];
  /** Fields not applicable to this unit right now (e.g. diagnosis for an up unit). */
  notApplicable: CompletenessField[];
}

function hasText(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Assess one unit. `asOfIso` (YYYY-MM-DD) anchors the "recent inspection" window.
 * `repair_diagnosis` and `parts_info` are only APPLICABLE while a unit is down —
 * we don't flag an operational unit for lacking a diagnosis.
 */
export function assessUnit(
  unit: CompletenessUnitInput,
  related: CompletenessRelated,
  asOfIso: string,
): UnitCompleteness {
  const isDown = DOWN_STATUSES.has(unit.status);

  const present: Record<CompletenessField, boolean> = {
    photo: hasText(unit.photo_url) || (unit.photos?.length ?? 0) > 0,
    make: hasText(unit.make),
    model: hasText(unit.model),
    serial: hasText(unit.serial_number),
    // "meter" = a confirmed hour reading exists. Missing ≠ zero hours.
    meter: unit.current_hours !== null,
    // "pm_schedule" = a confirmed service interval exists.
    pm_schedule: unit.service_interval_hours !== null && unit.service_interval_hours > 0,
    recent_inspection: isRecent(unit.last_inspection_date, asOfIso, RECENT_INSPECTION_DAYS),
    service_history: related.serviceRecordCount > 0,
    // Diagnosis counts only once triage reaches a diagnosed state.
    repair_diagnosis: isDiagnosed(unit.triage_status),
    parts_info: (unit.needs_parts_ordered === true && hasText(unit.parts_needed)) || related.partsCount > 0,
  };

  // Diagnosis + parts info are only expected for down units.
  const notApplicable: CompletenessField[] = isDown ? [] : ["repair_diagnosis", "parts_info"];
  const naSet = new Set(notApplicable);

  const missing = COMPLETENESS_FIELDS
    .map((f) => f.field)
    .filter((field) => !present[field] && !naSet.has(field));

  return { id: unit.id, name: unit.name, present, missing, notApplicable };
}

export interface CompletenessSummary {
  totalUnits: number;
  /** field → how many units are missing it (excluding not-applicable). */
  missingByField: Record<CompletenessField, number>;
  /** field → how many units have it recorded. */
  presentByField: Record<CompletenessField, number>;
}

export function summarizeCompleteness(assessments: readonly UnitCompleteness[]): CompletenessSummary {
  const missingByField = blankFieldCounts();
  const presentByField = blankFieldCounts();

  for (const a of assessments) {
    const naSet = new Set(a.notApplicable);
    for (const { field } of COMPLETENESS_FIELDS) {
      if (naSet.has(field)) continue;
      if (a.present[field]) presentByField[field] += 1;
      else missingByField[field] += 1;
    }
  }
  return { totalUnits: assessments.length, missingByField, presentByField };
}

/**
 * Prioritized collection queue — what to gather next. Focuses on the four
 * "identity/PM" gaps the GM can realistically supply: meter, PM schedule, make,
 * serial. Down units and units missing the most rise to the top. A QUEUE, not a
 * blocker: nothing here stops the app from working.
 */
export interface CollectionQueueEntry {
  id: string;
  name: string;
  needs: CompletenessField[]; // subset of the four collectible fields
  priority: number; // higher = collect sooner
}

const COLLECTIBLE: CompletenessField[] = ["meter", "pm_schedule", "make", "serial"];

export function collectionQueue(
  units: readonly CompletenessUnitInput[],
  assessments: readonly UnitCompleteness[],
): CollectionQueueEntry[] {
  const statusById = new Map(units.map((u) => [u.id, u.status]));

  const entries: CollectionQueueEntry[] = [];
  for (const a of assessments) {
    const needs = COLLECTIBLE.filter((f) => a.missing.includes(f));
    if (needs.length === 0) continue;
    const isDown = DOWN_STATUSES.has(statusById.get(a.id) ?? "");
    // Down units first, then by how many collectible fields are missing.
    const priority = (isDown ? 100 : 0) + needs.length;
    entries.push({ id: a.id, name: a.name, needs, priority });
  }

  return entries.sort((x, y) => y.priority - x.priority || x.name.localeCompare(y.name));
}

function blankFieldCounts(): Record<CompletenessField, number> {
  return {
    photo: 0, make: 0, model: 0, serial: 0, meter: 0,
    pm_schedule: 0, recent_inspection: 0, service_history: 0,
    repair_diagnosis: 0, parts_info: 0,
  };
}

function isRecent(dateIso: string | null, asOfIso: string, withinDays: number): boolean {
  if (!dateIso) return false;
  const d = Date.parse(`${dateIso.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${asOfIso}T00:00:00Z`);
  if (Number.isNaN(d) || Number.isNaN(now)) return false;
  const diffDays = (now - d) / 86_400_000;
  return diffDays >= 0 && diffDays <= withinDays;
}
