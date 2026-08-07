"use client";

/**
 * One day of the schedule, editable in place.
 *
 * The old version of this sheet listed the day's shifts and made you open a
 * second sheet to change anything — three taps to swap a name, three more to
 * move a finish time. Everything the GM actually does to a day is now on the
 * row itself: who works it, when it starts and ends, whether it is pinned, and
 * a delete. The second sheet still exists behind the pencil for the things
 * that genuinely need a form (exact times, a note).
 *
 * Two things here are not per-shift:
 *   - "This day needs" sets the day's required headcount, overriding the
 *     weekday coverage rule for this date alone. That is what makes the blank
 *     open-shift lines go away for good instead of coming back on the next
 *     rebuild.
 *   - "Hold this day" locks the whole day, so no rebuild touches it.
 */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Lock,
  LockOpen,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { compactTime, hhmm, shortDate } from "@/lib/pro-shop/schedule-engine";
import { formatHours, minutesOfDay, paidMinutes, timeFromMinutes } from "@/lib/pro-shop/hours";
import { openSlotsForDay, type OpenSlot } from "@/lib/pro-shop/coverage";
import {
  effectiveRulesForDay,
  hasDayOverride,
  isDayLocked,
  MAX_DAY_STAFF,
  ruleCountsForDay,
  type DayGroupOverride,
  type DayOverrides,
} from "@/lib/pro-shop/day-overrides";
import {
  GROUP_LABELS,
  positionGroup,
  type CoverageRule,
  type DayWarning,
  type ProShopShift,
  type ProShopStaff,
  type ScheduleSettings,
  type ShiftGroup,
  type WarningCode,
} from "@/lib/pro-shop/types";

/** Smallest change either end of a shift can move by. Schedules are :00/:30. */
const STEP_MINUTES = 30;
/** A shift may never collapse to nothing. */
const MIN_SHIFT_MINUTES = 30;
/** How long to wait after the last ± before saving, so a run of taps is one write. */
const SAVE_DELAY_MS = 600;
/**
 * The "take this shift off the schedule" entry in the who-works-it dropdown.
 * Deleting is the other half of reassigning, and this is where the GM is
 * already looking when he decides a shift should not happen at all.
 */
const REMOVE_OPTION = "__remove__";

const selectCls =
  "px-2 py-1 rounded-lg border border-input bg-background text-sm max-w-full";

export interface DayEditorProps {
  date: string;
  shifts: ProShopShift[];
  staff: ProShopStaff[];
  staffById: Record<string, ProShopStaff>;
  /** Every coverage rule for the area — filtered to this date's weekday here. */
  rules: CoverageRule[];
  overrides: DayOverrides;
  settings: ScheduleSettings;
  /** The groups this area schedules, in display order. */
  groups: ShiftGroup[];
  activeIssues: DayWarning[];
  dismissedIssues: DayWarning[];
  onDismiss: (code: WarningCode) => void;
  onRestore: (code: WarningCode) => void;
  /** Open the full form for the fiddly bits (exact times, note). */
  onEditFull: (shift: ProShopShift) => void;
  onAdd: () => void;
  onCover: () => void;
  updateShift: (id: string, patch: Partial<ProShopShift>) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
  addShift: (input: {
    staff_id: string; shift_date: string; group: ShiftGroup;
    start_time: string; end_time: string; note?: string | null; locked?: boolean;
  }) => Promise<void>;
  setDayCounts: (date: string, group: ShiftGroup, counts: DayGroupOverride | null) => Promise<void>;
  setDayLock: (date: string, locked: boolean) => Promise<void>;
  resetDay: (date: string) => Promise<void>;
}

export function DayEditor(props: DayEditorProps) {
  const {
    date, shifts, staff, staffById, rules, overrides, settings, groups,
    activeIssues, dismissedIssues, onDismiss, onRestore,
    onEditFull, onAdd, onCover,
    updateShift, deleteShift, addShift, setDayCounts, setDayLock, resetDay,
  } = props;

  const [busy, setBusy] = useState(false);
  const locked = isDayLocked(date, overrides);
  const customised = hasDayOverride(date, overrides);
  const todaysRules = effectiveRulesForDay(date, rules, overrides);
  const normalCounts = ruleCountsForDay(date, rules);
  const openSlots = openSlotsForDay(
    shifts.map((s) => ({ group: s.group, start_time: s.start_time, end_time: s.end_time })),
    todaysRules,
  );

  /** Run one write, keeping the sheet from firing a second while it lands. */
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "That change didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Hand edits pin themselves. Without it the next rebuild would quietly undo
   * the change that was just made by hand, which is the single most confusing
   * thing a scheduler can do.
   */
  /**
   * Deliberately NOT routed through `run`: that drops a call while another is
   * in flight, and a dropped time save would look like the row silently
   * reverting the change the GM just made. The row's own debounce already
   * coalesces a run of taps into one write.
   */
  async function saveTimes(id: string, start: string, end: string) {
    try {
      await updateShift(id, { start_time: start, end_time: end, locked: true });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Those times didn't save. Try again.");
    }
  }

  function swapPerson(shift: ProShopShift, staffId: string) {
    if (staffId === shift.staff_id) return;
    // The generator never books one person twice in a day; a hand swap must not
    // either, or the same name silently appears on the day twice.
    const clash = shifts.find((s) => s.staff_id === staffId && s.id !== shift.id);
    if (clash) {
      window.alert(
        `${staffById[staffId]?.full_name ?? "That person"} already works ${shortDate(date)}`
        + ` (${compactTime(clash.start_time)}-${compactTime(clash.end_time)}).`
        + " Delete or move that shift first.",
      );
      return;
    }
    void run(() => updateShift(shift.id, { staff_id: staffId, locked: true }));
  }

  function removeShift(shift: ProShopShift) {
    const who = staffById[shift.staff_id]?.full_name ?? "this shift";
    const ok = window.confirm(
      `Delete ${who}'s ${compactTime(shift.start_time)}-${compactTime(shift.end_time)} shift on ${shortDate(date)}?`,
    );
    if (!ok) return;
    void run(() => deleteShift(shift.id));
  }

  function fillOpenSlot(slot: OpenSlot, staffId: string) {
    if (!staffId) return;
    const clash = shifts.find((s) => s.staff_id === staffId);
    if (clash) {
      window.alert(
        `${staffById[staffId]?.full_name ?? "That person"} already works ${shortDate(date)}`
        + ` (${compactTime(clash.start_time)}-${compactTime(clash.end_time)}).`,
      );
      return;
    }
    void run(() =>
      addShift({
        staff_id: staffId, shift_date: date, group: slot.group,
        start_time: slot.start, end_time: slot.end, locked: true,
      }),
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* ── Hold the day / back to normal ──────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => setDayLock(date, !locked))}
          aria-pressed={locked}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            locked
              ? "border-emerald-400 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
              : "border-border bg-card text-muted-foreground hover:bg-muted"
          }`}
          title="A held day is skipped by every rebuild — nothing on it changes"
        >
          {locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
          {locked ? "Held — rebuilds skip this day" : "Hold this day"}
        </button>
        {customised && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Put ${shortDate(date)} back to the standard weekday coverage?`)) return;
              void run(() => resetDay(date));
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Back to normal
          </button>
        )}
      </div>

      {/* ── Needs attention ────────────────────────────────────────────────── */}
      {(activeIssues.length > 0 || dismissedIssues.length > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50/70 dark:bg-red-950/30 dark:border-red-900 p-3 space-y-2">
          {activeIssues.length > 0 && (
            <>
              <p className="text-xs font-semibold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Needs attention
              </p>
              <ul className="space-y-1.5">
                {activeIssues.map((w) => (
                  <li key={w.code} className="flex items-start justify-between gap-2">
                    <span className="text-xs text-red-700 dark:text-red-400 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w.message}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDismiss(w.code)}
                      className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border border-red-300 text-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 inline-flex items-center gap-1"
                      title="Bypass this — I'm fine with it"
                    >
                      <Ban className="w-3 h-3" /> Looks fine
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-red-600/80 dark:text-red-400/80">
                Fix it below — fill an open shift, or lower what the day needs.
              </p>
            </>
          )}
          {dismissedIssues.length > 0 && (
            <div className={activeIssues.length > 0 ? "pt-1.5 border-t border-red-200 dark:border-red-900" : ""}>
              <p className="text-[11px] font-medium text-muted-foreground mb-1">Dismissed</p>
              <ul className="space-y-1">
                {dismissedIssues.map((w) => (
                  <li key={w.code} className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground line-through">{w.message}</span>
                    <button
                      type="button"
                      onClick={() => onRestore(w.code)}
                      className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1"
                      title="Restore this warning"
                    >
                      <Undo2 className="w-3 h-3" /> Undo
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── Per group: how many, who, and what's still open ─────────────────── */}
      {groups.map((group) => {
        const rule = todaysRules.find((r) => r.group === group);
        const list = shifts.filter((s) => s.group === group);
        const groupOpen = openSlots.filter((s) => s.group === group);
        const normal = normalCounts[group];
        const changed =
          !!rule && !!normal && (rule.base_staff !== normal.base || rule.extra_staff !== normal.extra);
        // Only people who could actually take this group's work — their own
        // group always, the other one only when the GM has ticked them as flex.
        const eligible = staff.filter(
          (person) => person.is_active
            && (positionGroup(person.position) === group || person.flex === true),
        );

        if (!rule && list.length === 0) return null;

        return (
          <div key={group} className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold">{GROUP_LABELS[group]}</p>
              {rule && (
                <span className="text-[11px] text-muted-foreground">
                  {compactTime(rule.open_time)}-{compactTime(rule.close_time)}
                </span>
              )}
            </div>

            {/* How many this DAY needs — the weekday rule unless changed here. */}
            {rule && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-muted/40 px-2.5 py-2">
                <span className="text-[11px] font-medium text-muted-foreground">This day needs</span>
                <Stepper
                  noun="people"
                  label={rule.base_staff === 1 ? "person" : "people"}
                  value={rule.base_staff}
                  disabled={busy}
                  onChange={(next) =>
                    void run(() => setDayCounts(date, group, { base: next, extra: rule.extra_staff }))
                  }
                />
                <Stepper
                  noun="extra"
                  label={rule.extra_start
                    ? `extra from ${compactTime(rule.extra_start)}`
                    : "extra"}
                  value={rule.extra_staff}
                  disabled={busy || !rule.extra_start}
                  onChange={(next) =>
                    void run(() => setDayCounts(date, group, { base: rule.base_staff, extra: next }))
                  }
                />
                {changed && normal && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => setDayCounts(date, group, null))}
                    className="text-[11px] underline text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    normally {normal.base}
                    {normal.extra > 0 ? ` + ${normal.extra}` : ""} — undo
                  </button>
                )}
              </div>
            )}

            {/* The shifts themselves. */}
            {list.length === 0 && groupOpen.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No one scheduled</p>
            ) : (
              <div className="space-y-2">
                {list.map((shift) => (
                  <ShiftRow
                    key={shift.id}
                    shift={shift}
                    eligible={eligible}
                    staffById={staffById}
                    settings={settings}
                    busy={busy}
                    onTimes={saveTimes}
                    onPerson={(staffId) => swapPerson(shift, staffId)}
                    onDelete={() => removeShift(shift)}
                    onPin={(next) => void run(() => updateShift(shift.id, { locked: next }))}
                    onEditFull={() => onEditFull(shift)}
                  />
                ))}

                {/* Shifts the day still needs somebody in — fillable right here
                    rather than only visible as a blank line on the grid. */}
                {groupOpen.map((slot, i) => (
                  <div
                    key={`open-${group}-${i}`}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 p-2"
                  >
                    <span className="text-sm tabular-nums font-medium">
                      {compactTime(slot.start)}-{compactTime(slot.end)}
                    </span>
                    <span className="text-[11px] text-amber-800 dark:text-amber-300">Open — nobody on it</span>
                    <select
                      className={`${selectCls} ml-auto`}
                      value=""
                      disabled={busy || eligible.length === 0}
                      onChange={(e) => fillOpenSlot(slot, e.target.value)}
                      aria-label={`Assign someone to the ${compactTime(slot.start)} shift`}
                    >
                      <option value="">Assign…</option>
                      {eligible.map((person) => (
                        <option key={person.id} value={person.id}>{person.full_name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onAdd} disabled={busy}>
          <Plus className="w-4 h-4" /> Add shift
        </Button>
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onCover} disabled={busy}>
          <UserMinus className="w-4 h-4" /> Day off / cover
        </Button>
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/**
 * One shift, fully editable in place.
 *
 * Times are held locally and written once the tapping stops: a GM adding two
 * hours taps + four times, and that should be one save, not four round trips
 * racing each other.
 */
function ShiftRow({
  shift,
  eligible,
  staffById,
  settings,
  busy,
  onTimes,
  onPerson,
  onDelete,
  onPin,
  onEditFull,
}: {
  shift: ProShopShift;
  eligible: ProShopStaff[];
  staffById: Record<string, ProShopStaff>;
  settings: ScheduleSettings;
  busy: boolean;
  onTimes: (id: string, start: string, end: string) => Promise<void>;
  onPerson: (staffId: string) => void;
  onDelete: () => void;
  onPin: (locked: boolean) => void;
  onEditFull: () => void;
}) {
  const savedStart = hhmm(shift.start_time);
  const savedEnd = hhmm(shift.end_time);

  /** Bumped on every remove attempt, purely to re-key the dropdown. */
  const [removeAttempt, setRemoveAttempt] = useState(0);

  /**
   * Times being nudged but not yet written. Null means "whatever the server
   * says" — which is how the row re-syncs without an effect copying props into
   * state: the draft is cleared once the save lands, and the saved value shows
   * through again.
   */
  const [draft, setDraft] = useState<{ start: string; end: string } | null>(null);
  const start = draft?.start ?? savedStart;
  const end = draft?.end ?? savedEnd;

  // Held in a ref so a new callback identity each render can't keep resetting
  // the timer and starve the save.
  const saveRef = useRef(onTimes);
  useEffect(() => {
    saveRef.current = onTimes;
  }, [onTimes]);
  useEffect(() => {
    if (!draft || (draft.start === savedStart && draft.end === savedEnd)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      // Cleared after the write resolves, not before: until then the draft is
      // what the GM tapped, and snapping back mid-save would look like a bug.
      // Cleared on failure too — the row then tells the truth about the server.
      void saveRef.current(shift.id, draft.start, draft.end).finally(() => {
        if (!cancelled) setDraft(null);
      });
    }, SAVE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, savedStart, savedEnd, shift.id]);

  const startMin = minutesOfDay(start);
  const endMin = minutesOfDay(end);
  const pending = start !== savedStart || end !== savedEnd;

  /**
   * Each tap builds on the last one, not on the last RENDER. Two taps inside a
   * single React batch both read the same rendered value, so "+30 +30" would
   * land on +30 — the second tap silently doing nothing.
   */
  function nudge(which: "start" | "end", delta: number) {
    setDraft((prev) => {
      const from = prev ?? { start: savedStart, end: savedEnd };
      const fromStart = minutesOfDay(from.start);
      const fromEnd = minutesOfDay(from.end);
      if (which === "start") {
        const next = Math.min(Math.max(0, fromStart + delta), fromEnd - MIN_SHIFT_MINUTES);
        return { start: timeFromMinutes(next), end: from.end };
      }
      const next = Math.max(Math.min(24 * 60, fromEnd + delta), fromStart + MIN_SHIFT_MINUTES);
      return { start: from.start, end: timeFromMinutes(next) };
    });
  }

  // The person on the shift may not be in the eligible list (a flex tick pulled
  // since, say). Keep them selectable so the row never silently reassigns.
  const current = staffById[shift.staff_id];
  const options = eligible.some((p) => p.id === shift.staff_id) || !current
    ? eligible
    : [current, ...eligible];

  return (
    <div className="rounded-lg border border-border p-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <select
          // Re-keyed on every remove attempt. A cancelled confirm changes no
          // state, so without this the dropdown would sit there still reading
          // "Remove this shift" for a shift that is still very much there.
          key={removeAttempt}
          className={`${selectCls} flex-1 min-w-0`}
          value={shift.staff_id}
          disabled={busy}
          onChange={(e) => {
            if (e.target.value === REMOVE_OPTION) {
              setRemoveAttempt((n) => n + 1);
              onDelete();
              return;
            }
            onPerson(e.target.value);
          }}
          aria-label="Who works this shift"
        >
          {options.map((person) => (
            <option key={person.id} value={person.id}>{person.full_name}</option>
          ))}
          <option value={REMOVE_OPTION}>— Remove this shift —</option>
        </select>
        <span className="text-xs tabular-nums font-semibold shrink-0">
          {formatHours(paidMinutes(start, end, settings))}h
        </span>
        <button
          type="button"
          onClick={() => onPin(!shift.locked)}
          disabled={busy}
          aria-pressed={!!shift.locked}
          title={shift.locked ? "Pinned — a rebuild keeps it" : "Not pinned — a rebuild may replace it"}
          className={`p-1.5 rounded-lg border shrink-0 disabled:opacity-50 ${
            shift.locked ? "border-emerald-400 text-emerald-700 dark:text-emerald-400" : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {shift.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
        </button>
        <button
          type="button"
          onClick={onEditFull}
          disabled={busy}
          title="Exact times and a note"
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted shrink-0 disabled:opacity-50"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title="Delete this shift"
          aria-label="Delete this shift"
          className="p-1.5 rounded-lg border border-border text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0 disabled:opacity-50"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <TimeNudger
          label="Start"
          value={start}
          disabled={busy}
          onNudge={(delta) => nudge("start", delta)}
          canDown={startMin - STEP_MINUTES >= 0}
          canUp={startMin + STEP_MINUTES <= endMin - MIN_SHIFT_MINUTES}
        />
        <TimeNudger
          label="End"
          value={end}
          disabled={busy}
          onNudge={(delta) => nudge("end", delta)}
          canDown={endMin - STEP_MINUTES >= startMin + MIN_SHIFT_MINUTES}
          canUp={endMin + STEP_MINUTES <= 24 * 60}
        />
        {pending && <span className="text-[11px] text-muted-foreground">saving…</span>}
        {shift.note && (
          <span className="text-[11px] text-muted-foreground truncate max-w-[10rem]">{shift.note}</span>
        )}
      </div>
    </div>
  );
}

/** A time with a half-hour back/forward either side of it. */
function TimeNudger({
  label,
  value,
  disabled,
  onNudge,
  canDown,
  canUp,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onNudge: (delta: number) => void;
  canDown: boolean;
  canUp: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] text-muted-foreground w-8">{label}</span>
      <button
        type="button"
        onClick={() => onNudge(-STEP_MINUTES)}
        disabled={disabled || !canDown}
        aria-label={`${label} half an hour earlier`}
        className="p-1 rounded border border-border hover:bg-muted disabled:opacity-30"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="tabular-nums font-medium w-14 text-center">{compactTime(value)}</span>
      <button
        type="button"
        onClick={() => onNudge(STEP_MINUTES)}
        disabled={disabled || !canUp}
        aria-label={`${label} half an hour later`}
        className="p-1 rounded border border-border hover:bg-muted disabled:opacity-30"
      >
        <Plus className="w-3 h-3" />
      </button>
    </span>
  );
}

/** A whole-number count with − and +. Used for the day's required headcount. */
function Stepper({
  label,
  noun,
  value,
  disabled,
  onChange,
}: {
  /** Shown beside the number; pluralised by the caller ("1 person", "2 people"). */
  label: string;
  /** Fixed word for the screen-reader labels, which must not change with the count. */
  noun: string;
  value: number;
  disabled: boolean;
  onChange: (next: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
        aria-label={`One fewer ${noun}`}
        className="p-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-30"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="tabular-nums text-sm font-semibold w-4 text-center">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(MAX_DAY_STAFF, value + 1))}
        disabled={disabled || value >= MAX_DAY_STAFF}
        aria-label={`One more ${noun}`}
        className="p-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-30"
      >
        <Plus className="w-3 h-3" />
      </button>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}
