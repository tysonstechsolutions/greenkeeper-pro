// Pure obligation/duty scheduling math. Everything takes an explicit `today`
// so it's deterministic and unit-testable. Local dates throughout (the app's
// convention — see my-day/schedule.ts): a "date" is a local YYYY-MM-DD.

import type {
  EvaluatedObligation,
  Obligation,
  ObligationCadence,
  OperationDuty,
} from "./types";

// ── Local-date helpers ──────────────────────────────────────────────────────

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Parse a local YYYY-MM-DD as local midnight (never UTC — a Z-parse shifts a
 *  day in US timezones). Returns null for empty/malformed input. */
function parseLocalYmd(ymd: string | null | undefined): Date | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** Whole days from `a` to `b` (positive when b is later). DST-safe. */
export function diffDays(a: Date, b: Date): number {
  return Math.round((atMidnight(b).getTime() - atMidnight(a).getTime()) / 86_400_000);
}

// ── Periods ─────────────────────────────────────────────────────────────────

/** The Sunday that starts the week containing `d`. Pay periods run Sun–Sat. */
export function weekStart(d: Date): Date {
  const s = atMidnight(d);
  s.setDate(s.getDate() - s.getDay()); // getDay(): 0 = Sunday
  return s;
}

/**
 * Period key containing `d`: 'W2026-07-12' | '2026-07' | '2026-Q3' | '2026'.
 *
 * Weekly keys are the week's Sunday rather than an ISO week number: ISO weeks
 * start Monday and their year can disagree with the calendar year at the
 * boundary (Dec 29 2025 is ISO 2026-W01), which would silently mis-file a
 * completion. A date is unambiguous and sorts correctly.
 */
export function periodKey(cadence: ObligationCadence, d: Date): string {
  const y = d.getFullYear();
  if (cadence === "weekly") return `W${ymdLocal(weekStart(d))}`;
  if (cadence === "monthly") return `${y}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  if (cadence === "quarterly") return `${y}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return `${y}`;
}

/** A date inside the period `offset` periods away from the one containing `d`.
 *  Anchored mid-period so month-length differences can't skew the result. */
function periodAnchor(cadence: ObligationCadence, d: Date, offset: number): Date {
  const y = d.getFullYear();
  if (cadence === "weekly") {
    // Anchor on the week's Sunday; offset in whole weeks.
    const s = weekStart(d);
    s.setDate(s.getDate() + offset * 7);
    return s;
  }
  if (cadence === "monthly") return new Date(y, d.getMonth() + offset, 15);
  if (cadence === "quarterly") return new Date(y, Math.floor(d.getMonth() / 3) * 3 + offset * 3, 15);
  return new Date(y + offset, 6, 1);
}

/** The obligation's due date within the period containing `anchor`. */
function dueDateInPeriod(ob: Obligation, anchor: Date): Date {
  const y = anchor.getFullYear();
  // Weekly: due on `due_weekday` within the Sun–Sat week that `anchor` starts.
  // Defaults to Monday (1) — the Sun–Sat pay period closes and the timecard
  // fix is due first thing Monday.
  if (ob.cadence === "weekly") {
    const due = weekStart(anchor);
    const weekday = Math.min(Math.max(ob.due_weekday ?? 1, 0), 6);
    due.setDate(due.getDate() + weekday);
    return due;
  }
  let month0: number;
  if (ob.cadence === "monthly") {
    month0 = anchor.getMonth();
  } else if (ob.cadence === "quarterly") {
    const qStart = Math.floor(anchor.getMonth() / 3) * 3;
    const within = Math.min(Math.max(ob.due_month ?? 1, 1), 3) - 1;
    month0 = qStart + within;
  } else {
    month0 = Math.min(Math.max(ob.due_month ?? 1, 1), 12) - 1;
  }
  const last = lastDayOfMonth(y, month0);
  const day = ob.due_day === -1 ? last : Math.min(ob.due_day, last);
  return new Date(y, month0, day);
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/** Runaway guard for the occurrence walk (~40 years of monthly periods). */
const MAX_OCCURRENCES = 500;

/**
 * Evaluate one obligation against `today`.
 *
 * Occurrences are generated from the period CONTAINING created_at (an
 * in-progress period still counts even if its due day has already passed —
 * a tank inspection added July 2 must still track July) forward until one
 * occurrence lies beyond both today and today + lead_days. The EARLIEST
 * uncompleted occurrence is the one shown, so:
 *   - misses from any number of periods back stay visible (and completable,
 *     oldest first) instead of silently aging out;
 *   - lead-time warnings work across period boundaries, including leads
 *     longer than one period;
 *   - periods that ended before the obligation existed are never counted
 *     as debt.
 */
export function evaluateObligation(
  ob: Obligation,
  completedPeriods: ReadonlySet<string>,
  today: Date,
): EvaluatedObligation {
  const created = atMidnight(new Date(ob.created_at));
  const t0 = atMidnight(today);
  const horizon = new Date(t0);
  horizon.setDate(horizon.getDate() + Math.max(ob.lead_days, 0));

  // The schedule START. `effective_from` (a local YYYY-MM-DD) lets an
  // obligation begin later than created_at — occurrences whose due date falls
  // before it are never owed (used to reschedule the whole set to August so the
  // July seed dates don't read as overdue). NULL = start at created_at, the
  // legacy behavior, byte-for-byte unchanged.
  const cutoff = parseLocalYmd(ob.effective_from);
  const start =
    cutoff && cutoff.getTime() > created.getTime() ? cutoff : created;
  const before = (due: Date): boolean =>
    cutoff !== null && due.getTime() < cutoff.getTime();

  // NOTE: occurrences start at the period CONTAINING `start`, so a period that
  // ended before the obligation began never becomes debt. An obligation added
  // mid-period still owes that period's work (seeded Jul 15 with due_day 1,
  // July is genuinely still owed and shows overdue) — that is deliberate; see
  // the engine tests. The loop only *stops* on an in-scope occurrence, so a
  // pre-cutoff due (e.g. this year's February when effective_from is August)
  // can never end the walk before the first real occurrence is reached.
  const occurrences: { period: string; due: Date }[] = [];
  let anchor = periodAnchor(ob.cadence, start, 0);
  for (let i = 0; i < MAX_OCCURRENCES; i++) {
    const due = dueDateInPeriod(ob, anchor);
    occurrences.push({ period: periodKey(ob.cadence, anchor), due });
    if (!before(due) && due.getTime() > t0.getTime() && due.getTime() > horizon.getTime()) break;
    anchor = periodAnchor(ob.cadence, anchor, 1);
  }

  // Occurrences owed before the schedule start are excluded outright, so a
  // pre-start period is never the shown one — in either branch below.
  const inScope = occurrences.filter((o) => !before(o.due));

  const uncompleted = inScope.filter((o) => !completedPeriods.has(o.period));

  if (uncompleted.length === 0) {
    // Everything through the horizon is handled. Show the most recent
    // occurrence that has actually come due (what was just finished); if
    // none has yet, show the first future one.
    const past = inScope.filter((o) => o.due.getTime() <= t0.getTime());
    const shown = past[past.length - 1] ?? inScope[inScope.length - 1];
    return {
      obligation: ob,
      period: shown.period,
      dueDate: ymdLocal(shown.due),
      status: "done",
      daysUntil: diffDays(t0, shown.due),
    };
  }

  const target = uncompleted[0];
  const daysUntil = diffDays(t0, target.due);
  const status = daysUntil < 0 ? "overdue" : daysUntil <= ob.lead_days ? "due_soon" : "upcoming";
  return {
    obligation: ob,
    period: target.period,
    dueDate: ymdLocal(target.due),
    status,
    daysUntil,
  };
}

/** Evaluate + sort for display: overdue first (oldest debt on top), then
 *  due-soon by date, then upcoming by date, done last. */
export function evaluateObligations(
  obligations: Obligation[],
  completions: { obligation_id: string; period: string }[],
  today: Date,
): EvaluatedObligation[] {
  const byObligation = new Map<string, Set<string>>();
  for (const c of completions) {
    let set = byObligation.get(c.obligation_id);
    if (!set) {
      set = new Set();
      byObligation.set(c.obligation_id, set);
    }
    set.add(c.period);
  }
  const EMPTY: ReadonlySet<string> = new Set();
  const rank: Record<string, number> = { overdue: 0, due_soon: 1, upcoming: 2, done: 3 };
  return obligations
    .filter((o) => o.is_active)
    .map((o) => evaluateObligation(o, byObligation.get(o.id) ?? EMPTY, today))
    .sort(
      (a, b) =>
        rank[a.status] - rank[b.status] ||
        a.dueDate.localeCompare(b.dueDate) ||
        a.obligation.sort_order - b.obligation.sort_order,
    );
}

// ── Season & duties ─────────────────────────────────────────────────────────

/** Operating season: late March through mid-October (worksheet: "late march
 *  or april" → "end of september or early october"). Adjustable here. */
export const SEASON = { startMonth0: 2, startDay: 20, endMonth0: 9, endDay: 15 };

export function isInSeason(d: Date): boolean {
  const m = d.getMonth();
  const day = d.getDate();
  if (m < SEASON.startMonth0 || m > SEASON.endMonth0) return false;
  if (m === SEASON.startMonth0 && day < SEASON.startDay) return false;
  if (m === SEASON.endMonth0 && day > SEASON.endDay) return false;
  return true;
}

export const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function weekdayKey(d: Date): string {
  return WEEKDAY_KEYS[d.getDay()];
}

/** Duties that run on `d`, respecting the season window. */
export function dutiesForDate(duties: OperationDuty[], d: Date): OperationDuty[] {
  const key = weekdayKey(d);
  const inSeason = isInSeason(d);
  return duties
    .filter(
      (duty) =>
        duty.is_active &&
        Array.isArray(duty.days) &&
        duty.days.includes(key) &&
        (duty.season === "year_round" || inSeason),
    )
    .sort((a, b) => a.sort_order - b.sort_order);
}
