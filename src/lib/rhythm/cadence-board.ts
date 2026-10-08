// "My Duties" — the GM's recurring work laid out by rhythm.
//
// The Operations Command Center answers "what is most urgent across the whole
// operation?" as one long ranked list. This answers the question Tyson
// actually plans his time around: "what do I owe today, this week, this
// month, this quarter, and this year — and how much of it is done?"
//
// Pure functions only: every input (obligations, completions, work items,
// today) is passed in so the board is deterministic and unit-testable. Local
// dates throughout, same convention as operations/engine.ts.

import {
  diffDays,
  dueDateInPeriod,
  evaluateObligation,
  periodAnchor,
  periodKey,
  weekStart,
  ymdLocal,
} from "@/lib/operations/engine";
import type {
  Obligation,
  ObligationCadence,
  ObligationCompletion,
} from "@/lib/operations/types";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

// ── Public types ────────────────────────────────────────────────────────────

export type RhythmTab = "today" | "week" | "month" | "quarter" | "year";

export const RHYTHM_TABS: RhythmTab[] = ["today", "week", "month", "quarter", "year"];

export const RHYTHM_TAB_LABELS: Record<RhythmTab, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

/** Heading over each tab's own recurring checklist. */
export const RHYTHM_CHECKLIST_LABELS: Record<RhythmTab, string> = {
  today: "Due today",
  week: "Every week",
  month: "Every month",
  quarter: "Every quarter",
  year: "Every year",
};

/** The obligation cadence each tab owns. Today owns none — it collects. */
const TAB_CADENCE: Record<Exclude<RhythmTab, "today">, ObligationCadence> = {
  week: "weekly",
  month: "monthly",
  quarter: "quarterly",
  year: "annual",
};

const CADENCE_RANK: Record<ObligationCadence, number> = {
  weekly: 0,
  monthly: 1,
  quarterly: 2,
  annual: 3,
};

export const CADENCE_NOUNS: Record<ObligationCadence, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Yearly",
};

/** One occurrence of a recurring obligation. */
export interface RhythmObligationRow {
  obligation: Obligation;
  /** Completion period key — what gets written when it's marked done. */
  period: string;
  /** Local YYYY-MM-DD due date of this occurrence. */
  dueDate: string;
  /** Days from today (negative = overdue). */
  daysUntil: number;
  done: boolean;
  /**
   * For catch-up rows only: how many OTHER earlier occurrences of the same
   * obligation are also still open. Completing this row reveals the next.
   */
  moreMissed: number;
}

/** One dated piece of one-off work (task, PR, goal step, calendar deadline…). */
export interface RhythmWorkRow {
  item: OperationalWorkItem;
  dueDate: string;
  daysUntil: number;
  done: boolean;
}

export interface RhythmMonth {
  /** 'YYYY-MM' */
  key: string;
  label: string;
  rows: RhythmObligationRow[];
}

export interface RhythmWindow {
  tab: RhythmTab;
  /** Inclusive local YYYY-MM-DD bounds of the window. */
  start: string;
  end: string;
  /** Human label for the window, e.g. "Oct 4 – 10" or "October 2026". */
  rangeLabel: string;
  /** The tab's own recurring checklist (weekly items on Week, etc.). */
  checklist: RhythmObligationRow[];
  /** Earlier occurrences never completed — shown first so nothing is lost. */
  catchUp: RhythmObligationRow[];
  /** Bigger-cycle obligations that happen to land inside this window. */
  alsoDue: RhythmObligationRow[];
  /** Today only: obligations inside their lead time — start them now. */
  startSoon: RhythmObligationRow[];
  /** One-off dated work in the window (Today: overdue + due today). */
  work: RhythmWorkRow[];
  /** Year only: quarterly + yearly items for each of the next 12 months. */
  months: RhythmMonth[];
  /** Progress over the checklist (Today: checklist + today's work). */
  done: number;
  total: number;
  /** Everything in the tab that still needs doing — the tab badge. */
  remaining: number;
}

export type RhythmBoard = Record<RhythmTab, RhythmWindow>;

export interface BuildRhythmBoardInput {
  obligations: Obligation[];
  completions: Pick<ObligationCompletion, "obligation_id" | "period">[];
  /** Operational work items (any source); obligations among them are ignored. */
  work: OperationalWorkItem[];
  currentUserId: string | null;
  today: Date;
}

// ── Date helpers ────────────────────────────────────────────────────────────

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseLocalYmd(ymd: string | null | undefined): Date | null {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function addDays(d: Date, days: number): Date {
  const out = atMidnight(d);
  out.setDate(out.getDate() + days);
  return out;
}

/** First day of the cadence period containing `d`. */
function periodStart(cadence: ObligationCadence, d: Date): Date {
  if (cadence === "weekly") return weekStart(d);
  if (cadence === "monthly") return new Date(d.getFullYear(), d.getMonth(), 1);
  if (cadence === "quarterly") return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
  return new Date(d.getFullYear(), 0, 1);
}

/** Inclusive [start, end] of the window a tab covers. */
export function rhythmWindowBounds(tab: RhythmTab, today: Date): { start: Date; end: Date } {
  const t = atMidnight(today);
  if (tab === "today") return { start: t, end: t };
  if (tab === "week") {
    const start = weekStart(t);
    return { start, end: addDays(start, 6) };
  }
  if (tab === "month") {
    return {
      start: new Date(t.getFullYear(), t.getMonth(), 1),
      end: new Date(t.getFullYear(), t.getMonth() + 1, 0),
    };
  }
  if (tab === "quarter") {
    const q0 = Math.floor(t.getMonth() / 3) * 3;
    return {
      start: new Date(t.getFullYear(), q0, 1),
      end: new Date(t.getFullYear(), q0 + 3, 0),
    };
  }
  return {
    start: new Date(t.getFullYear(), 0, 1),
    end: new Date(t.getFullYear(), 11, 31),
  };
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function rhythmRangeLabel(tab: RhythmTab, today: Date): string {
  const { start, end } = rhythmWindowBounds(tab, today);
  if (tab === "today") {
    return start.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  if (tab === "week") {
    return start.getMonth() === end.getMonth()
      ? `${shortDate(start)} – ${end.getDate()}`
      : `${shortDate(start)} – ${shortDate(end)}`;
  }
  if (tab === "month") {
    return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (tab === "quarter") {
    const q = Math.floor(start.getMonth() / 3) + 1;
    const from = start.toLocaleDateString("en-US", { month: "short" });
    const to = end.toLocaleDateString("en-US", { month: "short" });
    return `Q${q} · ${from} – ${to} ${end.getFullYear()}`;
  }
  return String(start.getFullYear());
}

// ── Obligation occurrences ──────────────────────────────────────────────────

interface ScheduleStart {
  /** Earliest date the obligation can be owed (period containing it counts). */
  start: Date;
  /** effective_from: occurrences due before this are never owed. */
  cutoff: Date | null;
}

/** Mirrors evaluateObligation's schedule start so both views agree. */
function scheduleStart(ob: Obligation): ScheduleStart {
  const created = atMidnight(new Date(ob.created_at));
  const cutoff = parseLocalYmd(ob.effective_from);
  const start = cutoff && cutoff.getTime() > created.getTime() ? cutoff : created;
  return { start, cutoff };
}

function inScope(ob: Obligation, schedule: ScheduleStart, anchor: Date, due: Date): boolean {
  if (schedule.cutoff && due.getTime() < schedule.cutoff.getTime()) return false;
  return periodStart(ob.cadence, anchor).getTime() >= periodStart(ob.cadence, schedule.start).getTime();
}

/** Runaway guard: ~10 years of weekly periods. */
const MAX_PERIODS = 520;

/** Every in-scope occurrence of `ob` whose due date falls inside [from, to]. */
export function obligationOccurrencesInRange(
  ob: Obligation,
  completed: ReadonlySet<string>,
  from: Date,
  to: Date,
  today: Date,
): RhythmObligationRow[] {
  const schedule = scheduleStart(ob);
  const t0 = atMidnight(today);
  const out: RhythmObligationRow[] = [];
  // Start one period early: a period that begins before `from` can still have
  // its due day inside the window (a weekly item due Monday, window starting
  // on Sunday is fine, but a monthly item due the 30th seen from a week that
  // spans two months needs the previous month).
  let anchor = periodAnchor(ob.cadence, from, -1);
  for (let i = 0; i < MAX_PERIODS; i++) {
    if (periodStart(ob.cadence, anchor).getTime() > to.getTime()) break;
    const due = dueDateInPeriod(ob, anchor);
    if (
      due.getTime() >= from.getTime()
      && due.getTime() <= to.getTime()
      && inScope(ob, schedule, anchor, due)
    ) {
      const period = periodKey(ob.cadence, anchor);
      out.push({
        obligation: ob,
        period,
        dueDate: ymdLocal(due),
        daysUntil: diffDays(t0, due),
        done: completed.has(period),
        moreMissed: 0,
      });
    }
    anchor = periodAnchor(ob.cadence, anchor, 1);
  }
  return out;
}

/**
 * The obligation's open occurrences due strictly before `before`, collapsed
 * into one catch-up row (the oldest, which is what completing will clear)
 * carrying how many more are behind it. Null when nothing is owed.
 */
function catchUpRow(
  ob: Obligation,
  completed: ReadonlySet<string>,
  before: Date,
  today: Date,
): RhythmObligationRow | null {
  const schedule = scheduleStart(ob);
  // Walk from the schedule start rather than a fixed lookback, exactly like
  // the engine: misses from any number of periods back stay visible.
  const from = periodStart(ob.cadence, schedule.start);
  const to = addDays(before, -1);
  if (to.getTime() < from.getTime()) return null;
  const open = obligationOccurrencesInRange(ob, completed, from, to, today).filter((row) => !row.done);
  if (open.length === 0) return null;
  return { ...open[0], moreMissed: open.length - 1 };
}

function completedPeriodsByObligation(
  completions: BuildRhythmBoardInput["completions"],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const c of completions) {
    let set = map.get(c.obligation_id);
    if (!set) {
      set = new Set();
      map.set(c.obligation_id, set);
    }
    set.add(c.period);
  }
  return map;
}

function compareRows(a: RhythmObligationRow, b: RhythmObligationRow): number {
  return Number(a.done) - Number(b.done)
    || a.dueDate.localeCompare(b.dueDate)
    || a.obligation.sort_order - b.obligation.sort_order
    || a.obligation.title.localeCompare(b.obligation.title);
}

// ── One-off work ────────────────────────────────────────────────────────────

const FINISHED = new Set(["completed", "verified"]);

/**
 * Whether a work item belongs on the GM's own list.
 *
 * The app runs in solo mode: crew have no logins and work from printed role
 * sheets, so crew duty occurrences stay off this view (they would bury the
 * GM's own work under hundreds of daily mowing and cleaning rows). Anything
 * named to someone else is theirs. Everything else — unassigned tasks, PRs,
 * standards, goals, deadlines — is the GM's to do or hand out.
 */
export function isMyRhythmWork(item: OperationalWorkItem, currentUserId: string | null): boolean {
  if (item.sourceType === "obligation") return false;
  if (item.status === "cancelled") return false;
  if (item.responsibleEmployee) return item.responsibleEmployee.id === currentUserId;
  if (item.sourceType === "duty") return item.responsiblePosition === "general_manager";
  return true;
}

function workRows(
  work: OperationalWorkItem[],
  currentUserId: string | null,
  today: Date,
  include: (due: string, done: boolean) => boolean,
): RhythmWorkRow[] {
  const t0 = atMidnight(today);
  const rows: RhythmWorkRow[] = [];
  for (const item of work) {
    if (!item.dueDate || !isMyRhythmWork(item, currentUserId)) continue;
    const dueDate = item.dueDate.slice(0, 10);
    const due = parseLocalYmd(dueDate);
    if (!due) continue;
    const done = FINISHED.has(item.status);
    if (!include(dueDate, done)) continue;
    rows.push({ item, dueDate, daysUntil: diffDays(t0, due), done });
  }
  return rows.sort((a, b) => Number(a.done) - Number(b.done)
    || a.dueDate.localeCompare(b.dueDate)
    || b.item.priorityScore - a.item.priorityScore
    || a.item.title.localeCompare(b.item.title));
}

// ── Board ───────────────────────────────────────────────────────────────────

function emptyWindow(tab: RhythmTab, today: Date): RhythmWindow {
  const { start, end } = rhythmWindowBounds(tab, today);
  return {
    tab,
    start: ymdLocal(start),
    end: ymdLocal(end),
    rangeLabel: rhythmRangeLabel(tab, today),
    checklist: [],
    catchUp: [],
    alsoDue: [],
    startSoon: [],
    work: [],
    months: [],
    done: 0,
    total: 0,
    remaining: 0,
  };
}

function finish(window: RhythmWindow, progressWork: RhythmWorkRow[]): RhythmWindow {
  window.checklist.sort(compareRows);
  window.alsoDue.sort(compareRows);
  window.catchUp.sort(compareRows);
  window.startSoon.sort(compareRows);
  const counted = [...window.checklist.map((r) => r.done), ...progressWork.map((r) => r.done)];
  window.total = counted.length;
  window.done = counted.filter(Boolean).length;
  // The 12-month look-ahead is for planning, not a to-do list — it never
  // counts toward the badge.
  window.remaining = [
    ...window.checklist,
    ...window.catchUp,
    ...window.alsoDue,
    ...window.work,
  ].filter((row) => !row.done).length;
  return window;
}

/** Build every tab of the board in one pass. */
export function buildRhythmBoard(input: BuildRhythmBoardInput): RhythmBoard {
  const today = atMidnight(input.today);
  const todayYmd = ymdLocal(today);
  const completedBy = completedPeriodsByObligation(input.completions);
  const EMPTY: ReadonlySet<string> = new Set();
  const active = input.obligations.filter((ob) => ob.is_active);
  const done = (ob: Obligation) => completedBy.get(ob.id) ?? EMPTY;

  // ── Today ──
  const todayWindow = emptyWindow("today", today);
  for (const ob of active) {
    todayWindow.checklist.push(
      ...obligationOccurrencesInRange(ob, done(ob), today, today, today),
    );
    const missed = catchUpRow(ob, done(ob), today, today);
    if (missed) todayWindow.catchUp.push(missed);
    const evaluated = evaluateObligation(ob, done(ob), today);
    if (evaluated.status === "due_soon" && evaluated.daysUntil > 0) {
      todayWindow.startSoon.push({
        obligation: ob,
        period: evaluated.period,
        dueDate: evaluated.dueDate,
        daysUntil: evaluated.daysUntil,
        done: false,
        moreMissed: 0,
      });
    }
  }
  todayWindow.work = workRows(input.work, input.currentUserId, today,
    (due, isDone) => due === todayYmd || (due < todayYmd && !isDone));
  const todaysWork = todayWindow.work.filter((row) => row.dueDate === todayYmd);

  const board = { today: finish(todayWindow, todaysWork) } as RhythmBoard;

  // ── Week / Month / Quarter / Year ──
  for (const tab of ["week", "month", "quarter", "year"] as const) {
    const cadence = TAB_CADENCE[tab];
    const window = emptyWindow(tab, today);
    const { start, end } = rhythmWindowBounds(tab, today);
    for (const ob of active) {
      const rows = obligationOccurrencesInRange(ob, done(ob), start, end, today);
      if (ob.cadence === cadence) {
        window.checklist.push(...rows);
        const missed = catchUpRow(ob, done(ob), start, today);
        if (missed) window.catchUp.push(missed);
      } else if (CADENCE_RANK[ob.cadence] > CADENCE_RANK[cadence]) {
        window.alsoDue.push(...rows);
      }
    }
    // Dated one-off work is only loaded ~30 days ahead, which always covers
    // the rest of this week and this month. Quarter and year would show a
    // misleadingly short list, so they stay obligation-only.
    if (tab === "week" || tab === "month") {
      const from = ymdLocal(start);
      const to = ymdLocal(end);
      window.work = workRows(input.work, input.currentUserId, today,
        (due) => due >= from && due <= to);
    }
    if (tab === "year") window.months = nextTwelveMonths(active, done, today);
    board[tab] = finish(window, []);
  }

  return board;
}

/** Quarterly and yearly occurrences for this month and the 11 after it. */
function nextTwelveMonths(
  obligations: Obligation[],
  done: (ob: Obligation) => ReadonlySet<string>,
  today: Date,
): RhythmMonth[] {
  const months: RhythmMonth[] = [];
  for (let i = 0; i < 12; i++) {
    const start = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const rows = obligations
      .filter((ob) => ob.cadence === "quarterly" || ob.cadence === "annual")
      .flatMap((ob) => obligationOccurrencesInRange(ob, done(ob), start, end, today))
      .sort(compareRows);
    months.push({
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
      label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      rows,
    });
  }
  return months;
}
