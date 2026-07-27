// Fleet readiness and gap analysis.
//
// Answers three questions the GM asked, all from recorded data:
//   1. What equipment does the course need, and how many? (Standard 4.1.15)
//   2. What do we actually have working right now?
//   3. What does that cost to put right, and what should the annual capital
//      line be? (Standard 4.2.2 — replace 20% of fleet value a year)
//
// Deterministic throughout. No dollar figure here is estimated: every amount
// is the sum of `fy26_assets.original_value` for real, named units. Where a
// figure cannot be computed from recorded data it is reported as null and the
// UI says so rather than showing a comforting zero.

import {
  classifyAsset,
  FLEET_CLASS_LABELS,
  FLEET_REQUIREMENTS,
  FLEET_REQUIRED_TOTAL,
  isFleetClass,
  type AssetClass,
  type FleetClass,
} from "./fleet-standard";

/** One unit as the register knows it. */
export interface FleetUnitInput {
  id: string;
  name: string | null;
  status: string | null;
  description?: string | null;
  /**
   * DPAS `original_value`, when the unit is linked to an asset record.
   * Postgres `numeric` arrives over PostgREST as a STRING, so both forms are
   * accepted — treating "13478.23" as unrecorded made every total read $0.
   */
  originalValue?: number | string | null;
}

export interface FleetUnit extends FleetUnitInput {
  assetClass: AssetClass;
  operational: boolean;
}

/** Statuses that mean "this machine can be used today". */
const OPERATIONAL = new Set(["operational"]);
/** Statuses that mean "this machine is not available". */
const DOWN = new Set(["out_of_service", "in_repair", "needs_service"]);

export interface FleetGapRow {
  fleetClass: FleetClass;
  label: string;
  purpose: string;
  required: number;
  operational: number;
  down: number;
  /** Shortfall against the standard. Zero when the requirement is met. */
  short: number;
  /** Value of the down units in this class, when recorded. */
  downValue: number | null;
  /** True when every unit of this class is out of action. */
  totalOutage: boolean;
}

export interface CartFleetStatus {
  total: number;
  operational: number;
  down: number;
  /** Percentage of the cart fleet unavailable, or null when there are none. */
  downPercent: number | null;
  /** Standard 2.3.7 allows no more than 5% down. */
  meetsStandard: boolean | null;
}

export interface FleetAnalysis {
  units: FleetUnit[];
  rows: FleetGapRow[];
  requiredTotal: number;
  operationalTotal: number;
  shortTotal: number;
  /** Classes where the requirement is met in full. */
  metClasses: number;
  carts: CartFleetStatus;
  /** Units the classifier could not place — shown for the GM to name. */
  unclassified: FleetUnit[];
  /** Total DPAS value of every recorded asset with a value. */
  registerValue: number;
  /** 20% of register value — the annual capital target in Standard 4.2.2. */
  annualReplacementTarget: number;
  /** Value tied up in down turf-fleet machines. */
  downFleetValue: number;
  /** Down units that carry no recorded value, so the figure above is a floor. */
  downUnitsMissingValue: number;
}

export function classifyFleet(units: FleetUnitInput[]): FleetUnit[] {
  return units.map((unit) => ({
    ...unit,
    assetClass: classifyAsset(unit.name, unit.description),
    operational: OPERATIONAL.has(unit.status ?? ""),
  }));
}

/** Numeric value of a recorded amount, or null when nothing usable is stored. */
export function recordedValue(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumValue(units: FleetUnit[]): { value: number; missing: number } {
  let value = 0;
  let missing = 0;
  for (const unit of units) {
    const amount = recordedValue(unit.originalValue);
    if (amount === null) missing += 1;
    else value += amount;
  }
  return { value, missing };
}

/**
 * Build the full readiness picture.
 *
 * A unit counts toward a requirement only when it is operational. A machine
 * sitting out of service does not maintain a golf course, and reporting it as
 * coverage would be the kind of comforting fiction this app exists to avoid.
 */
export function analyseFleet(input: FleetUnitInput[]): FleetAnalysis {
  const units = classifyFleet(input);

  const byClass = new Map<AssetClass, FleetUnit[]>();
  for (const unit of units) {
    const bucket = byClass.get(unit.assetClass);
    if (bucket) bucket.push(unit);
    else byClass.set(unit.assetClass, [unit]);
  }

  const rows: FleetGapRow[] = FLEET_REQUIREMENTS.map((requirement) => {
    const owned = byClass.get(requirement.fleetClass) ?? [];
    const operational = owned.filter((unit) => unit.operational).length;
    const down = owned.filter((unit) => DOWN.has(unit.status ?? "")).length;
    const downUnits = owned.filter((unit) => DOWN.has(unit.status ?? ""));
    const { value, missing } = sumValue(downUnits);
    return {
      fleetClass: requirement.fleetClass,
      label: requirement.label,
      purpose: requirement.purpose,
      required: requirement.required,
      operational,
      down,
      short: Math.max(0, requirement.required - operational),
      downValue: downUnits.length === 0 ? null : (missing === downUnits.length ? null : value),
      totalOutage: owned.length > 0 && operational === 0,
    };
  });

  const cartUnits = byClass.get("golf_cart") ?? [];
  const cartOperational = cartUnits.filter((unit) => unit.operational).length;
  const cartDown = cartUnits.length - cartOperational;
  const downPercent = cartUnits.length === 0
    ? null
    : Math.round((cartDown / cartUnits.length) * 1000) / 10;

  const downFleet = units.filter((unit) => isFleetClass(unit.assetClass) && DOWN.has(unit.status ?? ""));
  const downSummary = sumValue(downFleet);
  const registerSummary = sumValue(units);

  return {
    units,
    rows,
    requiredTotal: FLEET_REQUIRED_TOTAL,
    operationalTotal: rows.reduce((sum, row) => sum + Math.min(row.operational, row.required), 0),
    shortTotal: rows.reduce((sum, row) => sum + row.short, 0),
    metClasses: rows.filter((row) => row.short === 0).length,
    carts: {
      total: cartUnits.length,
      operational: cartOperational,
      down: cartDown,
      downPercent,
      meetsStandard: downPercent === null ? null : downPercent <= 5,
    },
    unclassified: byClass.get("unclassified") ?? [],
    registerValue: registerSummary.value,
    annualReplacementTarget: Math.round(registerSummary.value * 0.2 * 100) / 100,
    downFleetValue: downSummary.value,
    downUnitsMissingValue: downSummary.missing,
  };
}

/** Shortfalls worst-first: total outages before partial gaps. */
export function prioritisedGaps(analysis: FleetAnalysis): FleetGapRow[] {
  return analysis.rows
    .filter((row) => row.short > 0)
    .sort((a, b) =>
      Number(b.totalOutage) - Number(a.totalOutage)
      || b.short - a.short
      || a.label.localeCompare(b.label));
}

export function classLabel(cls: AssetClass): string {
  return FLEET_CLASS_LABELS[cls];
}
