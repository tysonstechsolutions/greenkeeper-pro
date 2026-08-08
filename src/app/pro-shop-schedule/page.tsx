"use client";
import { SCHEDULE_AREA_BLURBS, SCHEDULE_AREA_LABELS, type ScheduleArea } from "@/lib/pro-shop/types";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  format,
} from "date-fns";
import Link from "next/link";
import {
  CalendarClock,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  Plus,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Users,
  Pencil,
  Trash2,
  Sun,
  Moon,
  ListChecks,
  Lock,
  LockOpen,
  Printer,
  SlidersHorizontal,
  Sprout,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { callApi } from "@/lib/api/client";
import { useProShop, type ShiftInput } from "@/lib/pro-shop/use-pro-shop";
import {
  activeWarnings,
  compactTime,
  dayWarnings,
  hhmm,
  shortDate,
  summarizeWeekly,
  ymd,
} from "@/lib/pro-shop/schedule-engine";
import { effectiveRulesForDay, isDayLocked } from "@/lib/pro-shop/day-overrides";
import { matchStaffName, sanitizeWeekly, validDate } from "@/lib/pro-shop/schedule-update";
import { computeStaffHours, elapsedMinutes, formatHours, paidMinutes, staffDayKey } from "@/lib/pro-shop/hours";
import { openSlotsForDay, type OpenSlot } from "@/lib/pro-shop/coverage";
import { buildSchedulePrintHtml } from "@/lib/pro-shop/print-schedule";
import { CoverageRulesSheet } from "@/components/features/pro-shop/coverage-rules-sheet";
import {
  positionGroup,
  emptyWeekly,
  AREA_GROUPS,
  AREA_POSITIONS,
  GROUP_LABELS,
  GROUP_SHORT_LABELS,
  POSITION_LABELS,
  type DayWarning,
  type ProShopPosition,
  type ProShopShift,
  type ProShopStaff,
  type ScheduleSettings,
  type ShiftGroup,
  type TimeRange,
} from "@/lib/pro-shop/types";
import { Overlay } from "@/components/features/pro-shop/overlay";
import { AvailabilitySheet } from "@/components/features/pro-shop/availability-sheet";
import { CoverSheet } from "@/components/features/pro-shop/cover-sheet";
import { DayEditor } from "@/components/features/pro-shop/day-editor";
import { RebuildSheet } from "@/components/features/pro-shop/rebuild-sheet";
import { ADMIN_ROLES, RoleGuard } from "@/components/auth/role-guard";

const selectCls = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm";
const NOW = new Date();
const TODAY = ymd(NOW);

/**
 * One colour per job, used everywhere that job appears: the shift line on the
 * grid, the open-shift line, the legend and the roster card. Written out as
 * whole class strings rather than built from pieces, because Tailwind only
 * ships the classes it can literally see in the source.
 */
const GROUP_STYLE: Record<
  ShiftGroup,
  { icon: typeof Sun; text: string; dot: string; wash: string; rule: string }
> = {
  outside: {
    icon: Sun,
    text: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
    wash: "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
    rule: "border-amber-600",
  },
  inside: {
    icon: Moon,
    text: "text-indigo-700 dark:text-indigo-300",
    dot: "bg-indigo-500",
    wash: "bg-indigo-50 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
    rule: "border-indigo-500",
  },
  grounds: {
    icon: Sprout,
    text: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-600",
    wash: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    rule: "border-emerald-600",
  },
  shop: {
    icon: Wrench,
    text: "text-violet-700 dark:text-violet-300",
    dot: "bg-violet-500",
    wash: "bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-300",
    rule: "border-violet-500",
  },
  restaurant: {
    icon: UtensilsCrossed,
    text: "text-rose-700 dark:text-rose-300",
    dot: "bg-rose-500",
    wash: "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-300",
    rule: "border-rose-500",
  },
};

function firstName(name: string): string {
  return name.split(" ")[0];
}

/**
 * Where to put a right-click menu. Clamped here, where the viewport is real,
 * so it never opens half off the right or bottom edge of a phone.
 */
function menuAt(e: React.MouseEvent): { x: number; y: number } {
  return {
    x: Math.min(e.clientX, window.innerWidth - 200),
    y: Math.min(e.clientY, window.innerHeight - 170),
  };
}

export default function ProShopSchedulePage() {
  return (
    <RoleGuard
      allowedRoles={ADMIN_ROLES}
      fallback={(
        <div className="gk-page mx-auto">
          <h1>Pro Shop Schedule</h1>
          <div role="alert" className="gk-card mt-4 p-4 text-sm text-muted-foreground">
            Pro-shop roster, availability, and schedule publication are restricted to authorized management.
          </div>
        </div>
      )}
    >
      <ProShopScheduleContent />
    </RoleGuard>
  );
}

function ProShopScheduleContent() {
  // Two entirely separate schedules share this screen. Everything below —
  // staff, months, shifts, warnings — is scoped to the selected area.
  const [area, setArea] = useState<ScheduleArea>("pro_shop");
  const ps = useProShop(NOW.getFullYear(), NOW.getMonth(), area);
  const monthDate = useMemo(() => new Date(ps.year, ps.month0, 1), [ps.year, ps.month0]);

  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [availabilityStaff, setAvailabilityStaff] = useState<ProShopStaff | null>(null);
  const [coverDate, setCoverDate] = useState<{ date: string; offId?: string } | null>(null);
  const [editShift, setEditShift] = useState<
    { mode: "new"; date: string } | { mode: "edit"; shift: ProShopShift } | null
  >(null);
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rebuildOpen, setRebuildOpen] = useState(false);
  /** What the last rebuild did, so a scoped one says what it left alone. */
  const [rebuildResult, setRebuildResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** The shift currently being dragged, so a day cell knows what it is catching. */
  const [dragShiftId, setDragShiftId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  /**
   * The shift a right-click landed on, and where to put the menu. Position is
   * worked out in the event handler rather than at render, so this stays safe
   * to render on the server where there is no window to measure against.
   */
  const [shiftMenu, setShiftMenu] = useState<
    | ({ x: number; y: number } & (
      | { kind: "shift"; shift: ProShopShift }
      | { kind: "open"; date: string; slot: OpenSlot }
    ))
    | null
  >(null);
  /**
   * After excusing a stretch, the other days of the month carrying the very
   * same gap — offered in one go, because a 14:00–16:00 hole is rarely a
   * one-day thing and nobody wants to do it seven times.
   */
  const [spreadOffer, setSpreadOffer] = useState<
    { group: ShiftGroup; range: TimeRange; dates: string[] } | null
  >(null);
  /**
   * Where the menu is portalled to, set once the component is on a real page.
   * This route is prerendered, so `document.body` cannot be read while the
   * markup is being built — reading it at render time throws.
   */
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null);
  useEffect(() => setMenuHost(document.body), []);

  // Escape closes the right-click menu, same as clicking away from it.
  useEffect(() => {
    if (!shiftMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShiftMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shiftMenu]);

  // AI quick-update box (plain-English change → availability/time-off → regenerate).
  const [quickText, setQuickText] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickResult, setQuickResult] = useState<
    { summary: string; applied: string[]; unresolved: string[] } | null
  >(null);

  const grid = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthDate));
    const end = endOfWeek(endOfMonth(monthDate));
    return eachDayOfInterval({ start, end });
  }, [monthDate]);

  // Every hours figure the grid shows, in one pass over the month's shifts.
  // Hours are PAID hours — the unpaid lunch is already out of them.
  const hours = useMemo(
    () => computeStaffHours(ps.shifts, ps.settings),
    [ps.shifts, ps.settings],
  );

  /**
   * The roster split by job, in the area's own group order — so the panel
   * answers "who can work where" at a glance instead of listing nine names in
   * one column. Anybody whose position is not one of this area's groups (a
   * leftover from a move between schedules) lands in the last bucket rather
   * than disappearing off the screen.
   */
  const staffByGroup = useMemo(() => {
    const groups = AREA_GROUPS[area];
    const buckets = new Map<ShiftGroup, ProShopStaff[]>(groups.map((group) => [group, []]));
    const fallback = buckets.get(groups[groups.length - 1])!;
    for (const person of ps.staff) {
      (buckets.get(positionGroup(person.position)) ?? fallback).push(person);
    }
    return groups.map((group) => {
      // Anyone stood down keeps their card — their past shifts and hours are
      // still worth reading — but drops to the bottom, and is not counted as
      // somebody the schedule can call on.
      const people = (buckets.get(group) ?? [])
        .slice()
        .sort((a, b) => Number(b.is_active) - Number(a.is_active));
      return { group, people, working: people.filter((p) => p.is_active).length };
    });
  }, [ps.staff, area]);

  /**
   * Drop a dragged shift onto another day. The shift id travels in the drag's
   * own DataTransfer rather than only in React state, so the drop never
   * depends on a state update having committed first.
   */
  async function handleDropOnDate(date: string, transferred: string) {
    const shiftId = transferred || dragShiftId;
    setDragShiftId(null);
    setDragOverDate(null);
    if (!shiftId) return;
    const shift = ps.shifts.find((s) => s.id === shiftId);
    if (!shift || shift.shift_date === date) return;
    // The generator never books one person twice in a day; a hand move must
    // not either, or the same name silently lands on the day twice.
    const clash = ps.shifts.find(
      (s) => s.shift_date === date && s.staff_id === shift.staff_id && s.id !== shiftId,
    );
    if (clash) {
      const who = ps.staffById[shift.staff_id]?.full_name ?? "That person";
      window.alert(
        `${who} already works ${shortDate(date)} (${compactTime(clash.start_time)}-${compactTime(clash.end_time)}).`
        + " Move or delete that shift first, or edit this one to change the times.",
      );
      return;
    }
    setBusy(true);
    try {
      await ps.moveShift(shiftId, { shift_date: date });
    } finally {
      setBusy(false);
    }
  }

  /**
   * What a given date requires: its weekday's coverage rules, with any per-day
   * override applied. Every "how many does this day need" question on this
   * screen goes through here, so the grid, the warnings and the printout can
   * never disagree.
   */
  function rulesOn(dateStr: string) {
    return effectiveRulesForDay(dateStr, ps.rules, ps.dayOverrides);
  }

  /** Shifts that day still needs somebody in. Derived, so they survive a
   *  reload and show up on the printout as a blank line to sign. */
  function openOn(dateStr: string): OpenSlot[] {
    const rules = rulesOn(dateStr);
    if (rules.length === 0) return [];
    return openSlotsForDay(
      shiftsOn(dateStr).map((s) => ({
        group: s.group, start_time: s.start_time, end_time: s.end_time,
      })),
      rules,
    );
  }

  function handlePrint() {
    const html = buildSchedulePrintHtml({
      area, year: ps.year, month0: ps.month0,
      shifts: ps.shifts, staff: ps.staff, rules: ps.rules, overrides: ps.dayOverrides,
      settings: ps.settings, status: ps.schedule?.status, generatedOn: new Date(),
    });
    const win = window.open("", "_blank");
    if (!win) {
      window.alert("Allow pop-ups to print the schedule.");
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  }

  function shiftsOn(dateStr: string): ProShopShift[] {
    const order = AREA_GROUPS[area];
    const rank = (group: ShiftGroup) => {
      const index = order.indexOf(group);
      return index === -1 ? order.length : index;
    };
    return ps.shifts
      .filter((s) => s.shift_date === dateStr)
      .sort((a, b) => {
        if (a.group !== b.group) return rank(a.group) - rank(b.group);
        return hhmm(a.start_time).localeCompare(hhmm(b.start_time));
      });
  }

  /**
   * Take a shift off the schedule from the right-click menu. Named here rather
   * than inside the menu so the confirm reads the same as the one in the day
   * editor — deleting a shift is the same act wherever it is started from.
   */
  /**
   * Say a stretch needs nobody, then offer to do the same to every other day
   * in the month carrying an identical gap.
   */
  async function excuseWindow(date: string, group: ShiftGroup, range: TimeRange) {
    setBusy(true);
    try {
      await ps.setDayUnstaffed(date, group, range, false);
      // Read off the pre-change overrides, which is why the day just excused
      // has to be filtered out by hand rather than falling out naturally.
      const others = ps.datesInMonth().filter((other) =>
        other !== date
        && openOn(other).some((slot) =>
          slot.group === group && slot.start === range.start && slot.end === range.end));
      setSpreadOffer(others.length > 0 ? { group, range, dates: others } : null);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "That didn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function removeShift(shift: ProShopShift) {
    const who = ps.staffById[shift.staff_id]?.full_name ?? "this shift";
    const ok = window.confirm(
      `Delete ${who}'s ${compactTime(shift.start_time)}-${compactTime(shift.end_time)}`
      + ` shift on ${shortDate(shift.shift_date)}?`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await ps.deleteShift(shift.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "That shift didn't delete. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function changeMonth(delta: number) {
    const d = new Date(ps.year, ps.month0 + delta, 1);
    ps.setMonth(d.getFullYear(), d.getMonth());
  }

  /**
   * Rebuild the days the GM picked in the sheet. The window is already free of
   * held days by the time it gets here; the hook drops them again on its way to
   * the RPC, so neither route can rebuild a day that is being held.
   */
  async function handleRebuild(dates: string[]) {
    const exists = !!ps.schedule;
    setBusy(true);
    try {
      const result = await ps.generateMonth(exists, { dates });
      const days = result.rebuiltDates.length;
      setRebuildResult(
        `Rebuilt ${days} day${days === 1 ? "" : "s"}`
        + (result.skippedLocked.length
          ? `, left ${result.skippedLocked.length} held day${result.skippedLocked.length === 1 ? "" : "s"} alone`
          : "")
        + ".",
      );
      setRebuildOpen(false);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "The rebuild didn't run.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish() {
    if (!ps.schedule) return;
    setBusy(true);
    try {
      await ps.publishMonth(ps.schedule.id);
    } finally {
      setBusy(false);
    }
  }

  // AI quick-update: parse a plain-English change → apply time-off / availability
  // → regenerate the month. Applies immediately, then shows exactly what changed.
  async function applyQuickUpdate() {
    const text = quickText.trim();
    if (!text || quickBusy) return;
    setQuickBusy(true);
    setQuickError(null);
    setQuickResult(null);
    try {
      const roster = ps.staff
        .filter((s) => s.is_active)
        .map((s) => ({
          name: s.full_name,
          position: s.position,
          group: s.default_group,
          flex: s.flex,
          weekly: s.availability?.weekly ?? emptyWeekly(),
        }));

      const res = await callApi<{
        summary?: string;
        timeOff?: { staffName: string; start: string; end: string; reason?: string }[];
        availability?: { staffName: string; weekly: unknown; note?: string }[];
        unresolved?: string[];
      }>("pro-shop-ai", {
        method: "POST",
        // Fresh date, not the module-scope TODAY — this kiosk PWA stays open
        // across midnight, and the AI resolves "out until the 25th" against it.
        body: { action: "schedule_update", text, today: ymd(new Date()), roster },
      });

      const applied: string[] = [];
      // The AI's arrays aren't element-validated by the edge function — keep
      // only real strings so a malformed item can't crash the result render.
      const unresolved: string[] = (res.unresolved ?? []).filter(
        (u): u is string => typeof u === "string",
      );

      // Lasting availability changes.
      for (const a of res.availability ?? []) {
        const target = matchStaffName(a.staffName, ps.staff);
        if (!target) {
          unresolved.push(`Couldn't find "${a.staffName}" for an availability change.`);
          continue;
        }
        const weekly = sanitizeWeekly(a.weekly, target.default_group);
        if (!weekly) {
          unresolved.push(`Skipped ${target.full_name}: the new pattern wasn't clear.`);
          continue;
        }
        // Append to the person's standing availability notes ("student — no
        // Tuesdays") instead of overwriting them with this one change's note.
        const note = typeof a.note === "string" ? a.note.trim() : "";
        const existingNotes = target.availability?.notes?.trim() ?? "";
        const notes = note
          ? existingNotes
            ? `${existingNotes}\n${note}`
            : note
          : existingNotes;
        await ps.saveAvailability(target.id, { weekly, notes }, note || text);
        applied.push(`${target.full_name}: availability updated${note ? ` — ${note}` : ""}`);
      }

      // Temporary time off.
      for (const t of res.timeOff ?? []) {
        const target = matchStaffName(t.staffName, ps.staff);
        if (!target) {
          unresolved.push(`Couldn't find "${t.staffName}" for time off.`);
          continue;
        }
        const start = validDate(t.start);
        const end = validDate(t.end);
        if (!start || !end || end < start) {
          unresolved.push(`Skipped ${target.full_name}: the dates weren't clear.`);
          continue;
        }
        await ps.addTimeOff(target.id, start, end, t.reason || "Time off");
        applied.push(
          `${target.full_name}: off ${start}${end !== start ? `–${end}` : ""}${t.reason ? ` (${t.reason})` : ""}`,
        );
      }

      // Rebuild the whole month from the updated patterns/time-off. When a
      // schedule already exists this replaces every shift — including manual
      // edits and cover shifts — so ask first, same as the Regenerate button.
      let rebuilt = false;
      if (applied.length > 0) {
        const exists = !!ps.schedule;
        const okToRebuild =
          !exists ||
          window.confirm(
            "Rebuild this month's schedule from the updated availability/time-off? This replaces all shifts for the month, including manual edits.",
          );
        if (okToRebuild) {
          await ps.generateMonth(exists);
          rebuilt = true;
          setQuickText("");
        }
      }

      const aiSummary = typeof res.summary === "string" ? res.summary.trim() : "";
      setQuickResult({
        summary: !applied.length
          ? aiSummary || "No changes were applied."
          : rebuilt
            ? aiSummary || "Applied and rebuilt the schedule."
            : "Changes saved, but the schedule was NOT rebuilt — hit Regenerate when you're ready.",
        applied,
        unresolved,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/unknown action/i.test(msg)) {
        setQuickError(
          "AI quick-update needs the pro-shop-ai function redeployed. Until then, use Edit availability / Day off below.",
        );
      } else {
        setQuickError(msg || "Couldn't apply that. Try rephrasing, or edit availability / time off manually.");
      }
    } finally {
      setQuickBusy(false);
    }
  }

  // Per-day dismissed warning codes (from the month's schedule row).
  const dismissedMap = useMemo(
    () => ps.schedule?.dismissed_warnings ?? {},
    [ps.schedule],
  );

  // Active (non-dismissed) coverage issues, per flagged day in the month.
  const flaggedDays = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) });
    const out: { date: string; active: DayWarning[] }[] = [];
    for (const d of days) {
      const ds = ymd(d);
      const active = activeWarnings(dayWarnings(shiftsOn(ds), area, rulesOn(ds)), dismissedMap[ds]);
      if (active.length) out.push({ date: ds, active });
    }
    return out;
    // `ps.dayOverrides` and `area` are read through shiftsOn/rulesOn, which
    // are plain functions this memo cannot list. Leaving them out left the
    // "needs attention" list still naming a stretch that had just been
    // excused, while the grid beside it had already stopped showing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ps.shifts, ps.rules, ps.dayOverrides, area, monthDate, dismissedMap]);
  const warningDays = flaggedDays.length;

  // Active + dismissed issues for the currently-open day (for the day editor).
  const openDayWarnings = useMemo(() => {
    if (!dayOpen) return { active: [] as DayWarning[], dismissed: [] as DayWarning[] };
    const all = dayWarnings(shiftsOn(dayOpen), area, rulesOn(dayOpen));
    const codes = dismissedMap[dayOpen] ?? [];
    return {
      active: all.filter((w) => !codes.includes(w.code)),
      dismissed: all.filter((w) => codes.includes(w.code)),
    };
    // Same reason as flaggedDays above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOpen, ps.shifts, ps.rules, ps.dayOverrides, area, dismissedMap]);

  return (
    <div className="p-3 md:p-6 pb-28 max-w-6xl mx-auto">
      {/* Which schedule — the two are entirely separate rosters and months. */}
      <div className="mb-3 flex gap-2" role="group" aria-label="Choose schedule">
        {(Object.keys(SCHEDULE_AREA_LABELS) as ScheduleArea[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={area === key}
            onClick={() => setArea(key)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              area === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted/50"
            }`}
          >
            {SCHEDULE_AREA_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold leading-tight">{SCHEDULE_AREA_LABELS[area]} Schedule</h1>
            <p className="text-xs text-muted-foreground">{SCHEDULE_AREA_BLURBS[area]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => changeMonth(-1)} aria-label="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <button
            onClick={() => ps.setMonth(NOW.getFullYear(), NOW.getMonth())}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-border hover:bg-muted min-w-[9rem] text-center"
          >
            {format(monthDate, "MMMM yyyy")}
          </button>
          <Button variant="outline" size="icon" onClick={() => changeMonth(1)} aria-label="Next month">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}>
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Print</span>
          </Button>
          {ps.rules.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRulesOpen(true)}>
              <SlidersHorizontal className="w-4 h-4" /> <span className="hidden sm:inline">Coverage</span>
            </Button>
          )}
          <Link href="/pro-shop-schedule/duties">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ListChecks className="w-4 h-4" /> <span className="hidden sm:inline">Duties</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Status + actions */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {ps.schedule ? (
          <span
            className={`text-xs px-2 py-1 rounded-full border ${
              ps.schedule.status === "published"
                ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                : "bg-amber-50 border-amber-300 text-amber-700"
            }`}
          >
            {ps.schedule.status === "published" ? "Published" : "Draft"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Not created yet</span>
        )}
        {warningDays > 0 && (
          <button
            type="button"
            onClick={() => setAttentionOpen(true)}
            className="text-xs px-2 py-1 rounded-full border bg-red-50 border-red-300 text-red-700 inline-flex items-center gap-1 hover:bg-red-100 active:scale-95 transition"
            title="See what needs attention"
          >
            <AlertTriangle className="w-3 h-3" /> {warningDays} day{warningDays === 1 ? "" : "s"} need attention
            <ChevronRightIcon className="w-3 h-3" />
          </button>
        )}
        <div className="flex-1" />
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setRebuildOpen(true)} disabled={busy || ps.staff.length === 0}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {ps.schedule ? "Regenerate" : "Generate schedule"}
        </Button>
        {ps.schedule && ps.schedule.status !== "published" && (
          <Button size="sm" className="gap-1.5 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={handlePublish} disabled={busy}>
            <CheckCircle2 className="w-4 h-4" /> Publish
          </Button>
        )}
      </div>

      {ps.error && (
        <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{ps.error}</div>
      )}

      {rebuildResult && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-900 p-2.5 text-xs text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{rebuildResult}</span>
          <button
            type="button"
            onClick={() => setRebuildResult(null)}
            className="shrink-0 underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* A gap the GM has just excused is rarely a one-day thing. */}
      {spreadOffer && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 dark:bg-sky-950/30 dark:border-sky-900 p-2.5 text-xs text-sky-900 dark:text-sky-200">
          <CalendarOff className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">
            {spreadOffer.dates.length} other day{spreadOffer.dates.length === 1 ? "" : "s"} in{" "}
            {format(monthDate, "MMMM")} {spreadOffer.dates.length === 1 ? "has" : "have"} the same{" "}
            <strong className="tabular-nums">
              {compactTime(spreadOffer.range.start)}-{compactTime(spreadOffer.range.end)}
            </strong>{" "}
            gap for {GROUP_SHORT_LABELS[spreadOffer.group]}.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs shrink-0"
            disabled={busy}
            onClick={async () => {
              const offer = spreadOffer;
              setSpreadOffer(null);
              setBusy(true);
              try {
                await ps.setManyDaysUnstaffed(offer.dates, offer.group, offer.range);
              } catch (e) {
                window.alert(e instanceof Error ? e.message : "Those didn't save. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Clear those too
          </Button>
          <button
            type="button"
            className="shrink-0 underline hover:no-underline"
            onClick={() => setSpreadOffer(null)}
          >
            Just this day
          </button>
        </div>
      )}

      {/* AI quick update — plain-English change → availability/time-off → rebuild */}
      <div className="mb-3 rounded-xl border border-border bg-card p-3">
        <label className="text-xs font-medium flex items-center gap-1.5 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" /> Quick update
        </label>
        <div className="flex gap-2">
          <input
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyQuickUpdate();
              }
            }}
            placeholder={'e.g. "Aniya is out until July 25" or "Devin to 30 hours a week"'}
            disabled={quickBusy}
            className="flex-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          />
          <Button onClick={applyQuickUpdate} disabled={quickBusy || !quickText.trim()} className="gap-1.5 shrink-0">
            {quickBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Apply
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Type a change in plain English — it updates the person&apos;s availability or time off and rebuilds the month.
        </p>
        {quickError && <p className="text-xs text-red-600 mt-2">{quickError}</p>}
        {quickResult && (
          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-900 p-2.5 text-xs space-y-1">
            <p className="font-medium text-emerald-800 dark:text-emerald-300">{quickResult.summary}</p>
            {quickResult.applied.length > 0 && (
              <ul className="list-disc pl-4 text-emerald-700 dark:text-emerald-400">
                {quickResult.applied.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            )}
            {quickResult.unresolved.length > 0 && (
              <ul className="list-disc pl-4 text-amber-700 dark:text-amber-400">
                {quickResult.unresolved.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Shifts the last rebuild could not staff. Surfaced rather than dropped:
          the generator will not invent people, so this is a real hole. */}
      {ps.unfilled.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800 p-3">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            {ps.unfilled.length} shift{ps.unfilled.length === 1 ? "" : "s"} couldn&apos;t be staffed
          </p>
          <ul className="mt-1 text-[11px] text-amber-800 dark:text-amber-300 space-y-0.5">
            {ps.unfilled.slice(0, 6).map((slot, i) => (
              <li key={i}>
                {shortDate(slot.date)} · {GROUP_SHORT_LABELS[slot.group]}{" "}
                {compactTime(slot.start)}-{compactTime(slot.end)} — {slot.reason.toLowerCase()}
              </li>
            ))}
            {ps.unfilled.length > 6 && <li>…and {ps.unfilled.length - 6} more</li>}
          </ul>
          <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            Free someone up, clear somebody else to cover that job, or lower the count in Coverage.
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-2 text-xs text-muted-foreground">
        {AREA_GROUPS[area].map((group) => {
          const style = GROUP_STYLE[group];
          const Icon = style.icon;
          return (
            <span key={group} className="flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${style.text}`} /> {GROUP_LABELS[group]}
            </span>
          );
        })}
        <span className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Pinned · drag to another day · right-click to remove
        </span>
        <span className="flex items-center gap-1.5">
          {AREA_GROUPS[area].map((group) => (
            <span
              key={group}
              className={`inline-block w-6 border-b ${GROUP_STYLE[group].rule} ${GROUP_STYLE[group].wash}`}
            />
          ))}
          Open shift — colour says which job
        </span>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 text-[11px] font-medium text-muted-foreground border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="px-1 py-1 text-center">{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-7 border-l border-t border-border">
        {grid.map((day) => {
          const ds = ymd(day);
          const inMonth = isSameMonth(day, monthDate);
          const isToday = ds === TODAY;
          const dayShifts = shiftsOn(ds);
          // One block per job, in the area's own order, with a rule between
          // them. Built from the area rather than from a hard-coded
          // inside/outside pair — that pair silently rendered nothing at all
          // on the maintenance and restaurant schedules, whose shifts are
          // neither. Anything filed under a job this area does not have still
          // shows, at the end, rather than disappearing off the day.
          const blocks = [
            ...AREA_GROUPS[area].map((group) => dayShifts.filter((s) => s.group === group)),
            dayShifts.filter((s) => !AREA_GROUPS[area].includes(s.group)),
          ].filter((list) => list.length > 0);
          const warns = inMonth ? activeWarnings(dayWarnings(dayShifts, area, rulesOn(ds)), dismissedMap[ds]) : [];
          const line = (s: ProShopShift) => (
            <ShiftLine
              key={s.id}
              shift={s}
              name={firstName(ps.staffById[s.staff_id]?.full_name ?? "?")}
              // Week-to-date paid hours for that person through this day, so
              // the grid answers "how much has Mike had this week" in place.
              runningHours={formatHours(
                hours.runningByStaffDate.get(staffDayKey(s.staff_id, ds)) ?? 0,
              )}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", s.id);
                e.dataTransfer.effectAllowed = "move";
                setDragShiftId(s.id);
              }}
              onDragEnd={() => { setDragShiftId(null); setDragOverDate(null); }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShiftMenu({ kind: "shift", shift: s, ...menuAt(e) });
              }}
            />
          );
          return (
            // A plain cell rather than a button: it hosts draggable shifts and
            // is itself a drop target, neither of which may live in a button.
            <div
              key={ds}
              onDragOver={(e) => { if (inMonth) { e.preventDefault(); setDragOverDate(ds); } }}
              onDragLeave={() => setDragOverDate((d) => (d === ds ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                if (inMonth) void handleDropOnDate(ds, e.dataTransfer.getData("text/plain"));
              }}
              className={`relative min-h-[6.5rem] border-r border-b border-border p-1 align-top ${
                inMonth ? "hover:bg-muted/40" : "bg-muted/30"
              } ${dragOverDate === ds ? "ring-2 ring-inset ring-primary bg-primary/5" : ""}`}
            >
              {inMonth && (
                <button
                  type="button"
                  onClick={() => setDayOpen(ds)}
                  className="absolute inset-0 w-full h-full"
                  aria-label={`Open ${shortDate(ds)}`}
                />
              )}
              <div className="relative pointer-events-none flex items-center justify-between mb-0.5">
                <span
                  className={`text-[11px] w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? "bg-primary text-primary-foreground font-bold" : inMonth ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {format(day, "d")}
                </span>
                <span className="flex items-center gap-1">
                  {/* A held day is skipped by every rebuild — worth seeing on
                      the month, not only inside the day. */}
                  {inMonth && isDayLocked(ds, ps.dayOverrides) && (
                    <Lock className="w-3 h-3 text-emerald-600" aria-label="Held — rebuilds skip this day" />
                  )}
                  {warns.length > 0 && <AlertTriangle className="w-3 h-3 text-red-500" />}
                </span>
              </div>
              {inMonth && (
                <div className="relative space-y-px">
                  {blocks.map((list, i) => (
                    <Fragment key={list[0].group}>
                      {i > 0 && <div className="h-px bg-border my-0.5" />}
                      {list.map(line)}
                    </Fragment>
                  ))}
                  {/* A shift with nobody on it, shown rather than left blank.
                      Solid underline with room for a name, tinted in the
                      group's colour — the same as it prints. */}
                  {openOn(ds).map((slot, i) => {
                    const style = GROUP_STYLE[slot.group];
                    return (
                      <div
                        key={`open-${i}`}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShiftMenu({ kind: "open", date: ds, slot, ...menuAt(e) });
                        }}
                        className={`relative flex items-end gap-1 text-[10px] leading-tight px-1 rounded ${style.wash}`}
                        title={`Open ${GROUP_SHORT_LABELS[slot.group]} shift — nobody scheduled.`
                          + " Right-click if nobody is needed."}
                      >
                        <span className="tabular-nums font-semibold">
                          {compactTime(slot.start)}-{compactTime(slot.end)}
                        </span>
                        <span
                          className={`flex-1 min-w-[2.5rem] h-[0.9rem] border-b ${style.rule}`}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Staff panel */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            <Users className="w-4 h-4" /> Staff & availability
          </h2>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAddStaffOpen(true)}>
            <Plus className="w-4 h-4" /> Add person
          </Button>
        </div>
        {ps.loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            {staffByGroup.map(({ group, people, working }) => {
              const style = GROUP_STYLE[group];
              const Icon = style.icon;
              // Everything except the group being listed — "can also cover" only
              // means anything when there is somewhere else to cover.
              const otherGroups = AREA_GROUPS[area].filter((g) => g !== group);
              return (
                <div key={group}>
                  <h3 className={`text-xs font-semibold mb-1.5 flex items-center gap-1.5 ${style.text}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {GROUP_LABELS[group]}
                    <span className="font-normal text-muted-foreground">
                      · {working} {working === 1 ? "person" : "people"}
                      {people.length > working && ` · ${people.length - working} stood down`}
                    </span>
                  </h3>
                  {people.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic pl-5">
                      Nobody on this job yet — add someone below.
                    </p>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2">
                      {people.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-start gap-3 p-3 rounded-lg border border-border"
                        >
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white ${style.dot}`}
                          >
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate flex items-center gap-1.5">
                              {s.full_name}
                              {!s.is_active && (
                                <span className="text-xs text-muted-foreground font-normal"> · inactive</span>
                              )}
                              {/* Paid hours for the whole month, next to the name. */}
                              <span className="ml-auto shrink-0 text-xs tabular-nums font-semibold">
                                {formatHours(hours.totalByStaff.get(s.id) ?? 0)}h
                              </span>
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {POSITION_LABELS[s.position]}
                              <span className="text-muted-foreground/70"> · this month</span>
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {summarizeWeekly(s)}
                            </p>
                            <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                              <Button
                                variant="outline" size="sm" className="h-7 gap-1.5 text-xs"
                                onClick={() => setAvailabilityStaff(s)}
                              >
                                <Pencil className="w-3 h-3" /> Availability
                              </Button>
                              {/* Somebody is only pulled onto another job when the
                                  GM has ticked them for it. */}
                              {otherGroups.length > 0 && (
                                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="h-3.5 w-3.5 accent-sky-600"
                                    checked={s.flex === true}
                                    onChange={(e) => void ps.setStaffFlex(s.id, e.target.checked)}
                                  />
                                  Can cover {otherGroups.map((g) => GROUP_SHORT_LABELS[g]).join(" / ")}
                                </label>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Right-click a shift ───────────────────────────────────────────── */}
      {/*
        Portalled to <body> on purpose. The route-enter animation puts a
        `transform` on an ancestor, and a transformed ancestor becomes the
        containing block for `position: fixed` — which offset the menu by the
        width of the sidebar and pushed it clean off the right of the screen.
      */}
      {shiftMenu && menuHost && createPortal(
        <>
          {/* Catches the click (or second right-click) that dismisses the menu. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShiftMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setShiftMenu(null); }}
          />
          <div
            role="menu"
            aria-label="Shift actions"
            style={{ top: shiftMenu.y, left: shiftMenu.x }}
            className="fixed z-50 w-48 rounded-lg border border-border bg-card py-1 shadow-lg"
          >
            {shiftMenu.kind === "shift" ? (
              <>
                <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border truncate">
                  {ps.staffById[shiftMenu.shift.staff_id]?.full_name ?? "Shift"}
                  {" · "}
                  {compactTime(shiftMenu.shift.start_time)}-{compactTime(shiftMenu.shift.end_time)}
                </p>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    const shift = shiftMenu.shift;
                    setShiftMenu(null);
                    setEditShift({ mode: "edit", shift });
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit shift…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    const shift = shiftMenu.shift;
                    setShiftMenu(null);
                    void ps.setShiftLocked(shift.id, !shift.locked);
                  }}
                >
                  {shiftMenu.shift.locked
                    ? <><LockOpen className="w-3.5 h-3.5" /> Unpin</>
                    : <><Lock className="w-3.5 h-3.5" /> Pin this shift</>}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  onClick={() => {
                    const shift = shiftMenu.shift;
                    setShiftMenu(null);
                    void removeShift(shift);
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove shift
                </button>
              </>
            ) : (
              /* An OPEN shift — nobody is on it yet. The useful thing to say
                 about one of these is usually "and nobody needs to be". */
              <>
                <p className="px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border truncate">
                  Open {GROUP_SHORT_LABELS[shiftMenu.slot.group]}
                  {" · "}
                  {compactTime(shiftMenu.slot.start)}-{compactTime(shiftMenu.slot.end)}
                </p>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    const { date, slot } = shiftMenu;
                    setShiftMenu(null);
                    void excuseWindow(date, slot.group, { start: slot.start, end: slot.end });
                  }}
                >
                  <CalendarOff className="w-3.5 h-3.5" /> Nobody needed
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    const { date } = shiftMenu;
                    setShiftMenu(null);
                    setDayOpen(date);
                  }}
                >
                  <Users className="w-3.5 h-3.5" /> Put someone on…
                </button>
              </>
            )}
          </div>
        </>,
        menuHost,
      )}

      {/* ── Day editor ────────────────────────────────────────────────────── */}
      {dayOpen && (
        <Overlay title={shortDate(dayOpen)} onClose={() => setDayOpen(null)}>
          <DayEditor
            date={dayOpen}
            shifts={shiftsOn(dayOpen)}
            staff={ps.staff}
            staffById={ps.staffById}
            rules={ps.rules}
            overrides={ps.dayOverrides}
            settings={ps.settings}
            groups={AREA_GROUPS[area]}
            activeIssues={openDayWarnings.active}
            dismissedIssues={openDayWarnings.dismissed}
            onDismiss={(code) => ps.dismissWarning(dayOpen, code)}
            onRestore={(code) => ps.restoreWarning(dayOpen, code)}
            onEditFull={(shift) => setEditShift({ mode: "edit", shift })}
            onAdd={() => setEditShift({ mode: "new", date: dayOpen })}
            onCover={() => setCoverDate({ date: dayOpen })}
            updateShift={ps.updateShift}
            deleteShift={ps.deleteShift}
            addShift={ps.addShift}
            setDayCounts={ps.setDayCounts}
            setDayLock={ps.setDayLock}
            onUnstaffed={(group, range, needed) =>
              needed
                ? ps.setDayUnstaffed(dayOpen, group, range, true)
                : excuseWindow(dayOpen, group, range)}
            resetDay={ps.resetDay}
          />
        </Overlay>
      )}

      {/* ── Rebuild scope ─────────────────────────────────────────────────── */}
      {rebuildOpen && (
        <RebuildSheet
          year={ps.year}
          month0={ps.month0}
          today={TODAY}
          overrides={ps.dayOverrides}
          shifts={ps.shifts}
          hasExisting={!!ps.schedule}
          busy={busy}
          onClose={() => setRebuildOpen(false)}
          onRebuild={handleRebuild}
        />
      )}

      {/* ── Shift add/edit ────────────────────────────────────────────────── */}
      {editShift && (
        <ShiftEditor
          state={editShift}
          staff={ps.staff}
          groups={AREA_GROUPS[area]}
          settings={ps.settings}
          onClose={() => setEditShift(null)}
          addShift={ps.addShift}
          updateShift={ps.updateShift}
          deleteShift={ps.deleteShift}
        />
      )}

      {/* ── Cover flow ────────────────────────────────────────────────────── */}
      {coverDate && (
        <CoverSheet
          date={coverDate.date}
          staff={ps.staff}
          dayShifts={shiftsOn(coverDate.date)}
          defaultOffStaffId={coverDate.offId}
          deleteShift={ps.deleteShift}
          addShift={ps.addShift}
          addTimeOff={ps.addTimeOff}
          onClose={() => {
            setCoverDate(null);
            setDayOpen(null);
          }}
        />
      )}

      {/* ── Availability ──────────────────────────────────────────────────── */}
      {availabilityStaff && (
        <AvailabilitySheet
          staff={availabilityStaff}
          onClose={() => setAvailabilityStaff(null)}
          onSave={async (availability, text, flex, employedThrough) => {
            await ps.saveAvailability(availabilityStaff.id, availability, text);
            if (flex !== availabilityStaff.flex) await ps.updateStaff(availabilityStaff.id, { flex });
            if (employedThrough !== (availabilityStaff.employed_through ?? null)) {
              await ps.updateStaff(availabilityStaff.id, { employed_through: employedThrough });
              // Months generated before they gave notice still hold their
              // shifts; clear the ones past the last day so the printed
              // schedule matches reality immediately.
              if (employedThrough) await ps.retireShiftsAfter(availabilityStaff.id, employedThrough);
            }
          }}
        />
      )}

      {/* ── Add staff ─────────────────────────────────────────────────────── */}
      {addStaffOpen && (
        <AddStaffSheet
          area={area}
          onClose={() => setAddStaffOpen(false)}
          addStaff={ps.addStaff}
        />
      )}

      {/* ── Coverage rules ────────────────────────────────────────────────── */}
      {rulesOpen && (
        <Overlay title="Coverage rules" onClose={() => setRulesOpen(false)}>
          <div className="p-4">
            <CoverageRulesSheet
              area={area}
              rules={ps.rules}
              settings={ps.settings}
              onSaveRule={ps.saveCoverageRule}
              onSaveSettings={ps.saveScheduleSettings}
            />
          </div>
        </Overlay>
      )}

      {/* ── Attention: days needing coverage ──────────────────────────────── */}
      {attentionOpen && (
        <Overlay
          title={`${warningDays} day${warningDays === 1 ? "" : "s"} need attention`}
          onClose={() => setAttentionOpen(false)}
        >
          <div className="p-4 space-y-2">
            {flaggedDays.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing needs attention. 🎉</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-1">
                  Tap a day to fix it, or dismiss issues you&apos;re fine with inside the day.
                </p>
                {flaggedDays.map(({ date, active }) => (
                  <button
                    key={date}
                    onClick={() => {
                      setAttentionOpen(false);
                      setDayOpen(date);
                    }}
                    className="w-full text-left p-3 rounded-lg border border-red-200 bg-red-50/60 hover:bg-red-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-red-800">{shortDate(date)}</span>
                      <ChevronRightIcon className="w-4 h-4 text-red-400" />
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {active.map((w) => (
                        <li key={w.code} className="text-xs text-red-700 flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w.message}
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </>
            )}
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function ShiftLine({
  shift,
  name,
  runningHours,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: {
  shift: ProShopShift;
  name: string;
  /** Week-to-date paid hours for this person through this shift's day. */
  runningHours?: string;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      className={`flex items-center gap-1 truncate text-[10px] leading-tight px-1 rounded ${
        GROUP_STYLE[shift.group].text
      } ${onDragStart ? "cursor-grab active:cursor-grabbing hover:bg-muted" : ""}`}
      title={[
        shift.note,
        shift.locked ? "Pinned — Regenerate will not move this" : null,
        runningHours ? `${runningHours}h this week through today` : null,
        onContextMenu ? "Right-click to remove or pin" : null,
      ].filter(Boolean).join(" · ") || undefined}
    >
      <span className="tabular-nums">
        {compactTime(shift.start_time)}-{compactTime(shift.end_time)}
      </span>
      <span className="truncate">{name}</span>
      {shift.locked && <Lock className="w-2.5 h-2.5 shrink-0 opacity-70" />}
      {shift.note ? <span>*</span> : null}
      {runningHours && (
        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{runningHours}h</span>
      )}
    </div>
  );
}

function ShiftEditor({
  state,
  staff,
  groups,
  settings,
  onClose,
  addShift,
  updateShift,
  deleteShift,
}: {
  state: { mode: "new"; date: string } | { mode: "edit"; shift: ProShopShift };
  staff: ProShopStaff[];
  /** The jobs this area schedules, in display order. */
  groups: ShiftGroup[];
  settings: ScheduleSettings;
  onClose: () => void;
  addShift: (input: ShiftInput) => Promise<void>;
  updateShift: (id: string, patch: Partial<ProShopShift>) => Promise<void>;
  deleteShift: (id: string) => Promise<void>;
}) {
  const editing = state.mode === "edit";
  const existing = editing ? state.shift : null;
  const date = editing ? state.shift.shift_date : state.date;

  const [staffId, setStaffId] = useState(existing?.staff_id ?? staff[0]?.id ?? "");
  const [group, setGroup] = useState<ShiftGroup>(
    existing?.group ?? (staff[0] ? positionGroup(staff[0].position) : groups[0]),
  );
  const [start, setStart] = useState(hhmm(existing?.start_time) || "08:00");
  const [end, setEnd] = useState(hhmm(existing?.end_time) || "14:00");
  const [note, setNote] = useState(existing?.note ?? "");
  // Defaults to pinned whether adding or editing: opening this editor at all
  // is a hand edit, and leaving it unpinned would let the next Regenerate
  // quietly undo the change that was just made. Untick to hand it back to the
  // generator.
  const [locked, setLocked] = useState(true);
  const [saving, setSaving] = useState(false);

  function onPickStaff(id: string) {
    setStaffId(id);
    const s = staff.find((x) => x.id === id);
    if (s && !editing) setGroup(positionGroup(s.position));
  }

  async function save() {
    if (!staffId) return;
    setSaving(true);
    try {
      if (editing && existing) {
        await updateShift(existing.id, {
          staff_id: staffId,
          group,
          start_time: start,
          end_time: end,
          note: note || null,
          locked,
        });
      } else {
        await addShift({ staff_id: staffId, shift_date: date, group, start_time: start, end_time: end, note, locked });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing) return;
    setSaving(true);
    try {
      await deleteShift(existing.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay title={`${editing ? "Edit" : "Add"} shift — ${shortDate(date)}`} onClose={onClose}>
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Person</Label>
          <select value={staffId} onChange={(e) => onPickStaff(e.target.value)} className={selectCls}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({POSITION_LABELS[s.position]})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Job</Label>
          <select value={group} onChange={(e) => setGroup(e.target.value as ShiftGroup)} className={selectCls}>
            {groups.map((g) => (
              <option key={g} value={g}>{GROUP_LABELS[g]}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">Start</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs">End</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. covering for Aniya" />
        </div>
        <div className="text-sm">
          <p className="text-xs text-muted-foreground mb-1">
            Paid hours:{" "}
            <strong className="text-foreground tabular-nums">
              {formatHours(paidMinutes(start, end, settings))}h
            </strong>
            {paidMinutes(start, end, settings) < elapsedMinutes(start, end)
              && ` (${settings.lunch_minutes} min unpaid lunch deducted)`}
          </p>
          <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-border p-2.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-emerald-700"
              checked={locked}
              onChange={(e) => setLocked(e.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1.5 font-medium">
                {locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                Pin this shift
              </span>
              <span className="block text-xs text-muted-foreground">
                Regenerate rebuilds the month around it instead of replacing it.
              </span>
            </span>
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          {editing && (
            <Button variant="outline" size="icon" onClick={remove} disabled={saving} aria-label="Delete shift">
              <Trash2 className="w-4 h-4 text-red-600" />
            </Button>
          )}
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={save} disabled={saving || !staffId}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}

function AddStaffSheet({
  area,
  onClose,
  addStaff,
}: {
  area: ScheduleArea;
  onClose: () => void;
  addStaff: (p: {
    full_name: string;
    position: ProShopPosition;
    default_group: ShiftGroup;
    flex: boolean;
    phone?: string | null;
  }) => Promise<void>;
}) {
  // The jobs this schedule has. Adding somebody to Buckley's must not offer to
  // make them a golf ops assistant.
  const positions = AREA_POSITIONS[area];
  const [name, setName] = useState("");
  const [position, setPosition] = useState<ProShopPosition>(positions[0]);
  const [flex, setFlex] = useState(positions.length === 1);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await addStaff({
        full_name: name.trim(),
        position,
        default_group: positionGroup(position),
        flex,
        phone: phone.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Overlay title={`Add ${SCHEDULE_AREA_LABELS[area]} staff`} onClose={onClose}>
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Position</Label>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value as ProShopPosition)}
            className={selectCls}
          >
            {positions.map((p) => (
              <option key={p} value={p}>
                {POSITION_LABELS[p]} ({GROUP_SHORT_LABELS[positionGroup(p)]})
              </option>
            ))}
          </select>
        </div>
        {AREA_GROUPS[area].length > 1 && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={flex} onChange={(e) => setFlex(e.target.checked)} className="w-4 h-4 mt-0.5" />
            <span>
              Flex employee
              <span className="block text-xs text-muted-foreground">
                Can be pulled onto the other jobs in {SCHEDULE_AREA_LABELS[area]} when needed.
              </span>
            </span>
          </label>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs">Phone (optional)</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          After adding, tap the person to set their weekly availability.
        </p>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="flex-1 bg-[#1B4332] hover:bg-[#2D6A4F]" onClick={save} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
