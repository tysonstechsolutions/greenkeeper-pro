/**
 * Safe preventive-maintenance status — Phase B (data-incomplete mode).
 *
 * This is the GUARD that keeps the app honest while manuals and meter readings
 * are missing. It NEVER classifies a unit as due or overdue unless BOTH:
 *   1. a confirmed service interval exists (entered by a person), AND
 *   2. a confirmed basis exists (a meter reading and/or a next-service date).
 *
 * With today's data (0/117 units have an interval or hours) it returns an
 * "unavailable" state for every unit — by design. No AI-generated intervals,
 * no guessing, no treating missing values as zero. Pure module: no I/O.
 */

export type PmState =
  | "unavailable_no_schedule" // no confirmed interval
  | "unavailable_no_meter" // interval exists but no meter/date basis
  | "unable_to_calculate" // data present but internally inconsistent
  | "ok"
  | "due_soon"
  | "overdue";

export interface PmStatusResult {
  state: PmState;
  /** Human-facing label for the UI. */
  label: string;
  /** Hours remaining until due (null unless computable). */
  hoursRemaining: number | null;
  /** Next-service due date if one was entered (null otherwise). */
  dueDate: string | null;
  /** Why the state was chosen (for tooltips / debugging). */
  basis: string;
}

export interface PmInputs {
  service_interval_hours: number | null | undefined;
  current_hours: number | null | undefined;
  next_service_due_hours: number | null | undefined;
  next_service_due_date: string | null | undefined;
}

/** Hours-before-due at which we call it "due soon" (only used once data exists). */
const DUE_SOON_HOURS = 10;

/**
 * Evaluate PM status safely. Order of checks guarantees we never fabricate a
 * "due" verdict from absent data.
 */
export function evaluatePmSafe(unit: PmInputs): PmStatusResult {
  const interval = numOrNull(unit.service_interval_hours);
  const hours = numOrNull(unit.current_hours);
  const dueHours = numOrNull(unit.next_service_due_hours);
  const dueDate = unit.next_service_due_date ?? null;

  // 1. No confirmed interval → schedule unavailable (the common case today).
  if (interval === null || interval <= 0) {
    return {
      state: "unavailable_no_schedule",
      label: "PM schedule unavailable",
      hoursRemaining: null,
      dueDate,
      basis: "No confirmed service interval entered for this unit.",
    };
  }

  // 2. Interval exists but no basis to measure against → meter unavailable.
  const haveHourBasis = hours !== null && dueHours !== null;
  if (!haveHourBasis && !dueDate) {
    return {
      state: "unavailable_no_meter",
      label: "Meter reading unavailable",
      hoursRemaining: null,
      dueDate,
      basis: "An interval is set but no meter reading or next-service date is recorded.",
    };
  }

  // 3. Hour-based computation from CONFIRMED numbers only.
  if (haveHourBasis) {
    const remaining = dueHours! - hours!;
    if (!Number.isFinite(remaining)) {
      return unableToCalculate(dueDate);
    }
    if (remaining <= 0) {
      return { state: "overdue", label: "Overdue for service", hoursRemaining: remaining, dueDate, basis: "Current hours have reached the next-service hours." };
    }
    if (remaining <= DUE_SOON_HOURS) {
      return { state: "due_soon", label: "Service due soon", hoursRemaining: remaining, dueDate, basis: `${remaining} h until next service.` };
    }
    return { state: "ok", label: "On schedule", hoursRemaining: remaining, dueDate, basis: `${remaining} h until next service.` };
  }

  // 4. Date-only basis (interval + a concrete next-service date, no meter).
  if (dueDate) {
    const due = Date.parse(`${dueDate}T00:00:00Z`);
    if (Number.isNaN(due)) return unableToCalculate(dueDate);
    return {
      state: "ok",
      label: "Scheduled by date",
      hoursRemaining: null,
      dueDate,
      basis: "Next service is tracked by date; overdue-by-date checks require a confirmed calendar rule (deferred).",
    };
  }

  return unableToCalculate(dueDate);
}

function unableToCalculate(dueDate: string | null): PmStatusResult {
  return {
    state: "unable_to_calculate",
    label: "Unable to calculate",
    hoursRemaining: null,
    dueDate,
    basis: "The recorded maintenance data is incomplete or inconsistent.",
  };
}

/** True when a real due/overdue verdict was produced (i.e. data was sufficient). */
export function pmIsComputable(state: PmState): boolean {
  return state === "ok" || state === "due_soon" || state === "overdue";
}

function numOrNull(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
