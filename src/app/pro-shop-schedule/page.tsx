"use client";
import { SCHEDULE_AREA_LABELS, type ScheduleArea } from "@/lib/pro-shop/types";

import { useMemo, useState } from "react";
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
  UserMinus,
  Sun,
  Moon,
  ListChecks,
  Ban,
  Undo2,
  Lock,
  LockOpen,
  Printer,
  SlidersHorizontal,
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
  parseYmd,
  shortDate,
  summarizeWeekly,
  ymd,
} from "@/lib/pro-shop/schedule-engine";
import { matchStaffName, sanitizeWeekly, validDate } from "@/lib/pro-shop/schedule-update";
import { computeStaffHours, elapsedMinutes, formatHours, paidMinutes, staffDayKey } from "@/lib/pro-shop/hours";
import { openSlotsForDay, type OpenSlot } from "@/lib/pro-shop/coverage";
import { buildSchedulePrintHtml } from "@/lib/pro-shop/print-schedule";
import { CoverageRulesSheet } from "@/components/features/pro-shop/coverage-rules-sheet";
import {
  positionGroup,
  emptyWeekly,
  type DayWarning,
  type ProShopShift,
  type ProShopStaff,
  type ShiftGroup,
  type WarningCode,
} from "@/lib/pro-shop/types";
import { Overlay } from "@/components/features/pro-shop/overlay";
import { AvailabilitySheet } from "@/components/features/pro-shop/availability-sheet";
import { CoverSheet } from "@/components/features/pro-shop/cover-sheet";
import { ADMIN_ROLES, RoleGuard } from "@/components/auth/role-guard";

const selectCls = "w-full px-3 py-2.5 rounded-lg border border-input bg-background text-sm";
const NOW = new Date();
const TODAY = ymd(NOW);

function firstName(name: string): string {
  return name.split(" ")[0];
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
  const [busy, setBusy] = useState(false);
  /** The shift currently being dragged, so a day cell knows what it is catching. */
  const [dragShiftId, setDragShiftId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

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

  /** The coverage rules that apply to a given date's weekday. */
  function rulesOn(dateStr: string) {
    const weekday = parseYmd(dateStr).getDay();
    return ps.rules.filter((r) => r.weekday === weekday);
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
      shifts: ps.shifts, staff: ps.staff, rules: ps.rules,
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
    return ps.shifts
      .filter((s) => s.shift_date === dateStr)
      .sort((a, b) => {
        if (a.group !== b.group) return a.group === "outside" ? -1 : 1;
        return hhmm(a.start_time).localeCompare(hhmm(b.start_time));
      });
  }

  function changeMonth(delta: number) {
    const d = new Date(ps.year, ps.month0 + delta, 1);
    ps.setMonth(d.getFullYear(), d.getMonth());
  }

  async function handleGenerate() {
    const exists = !!ps.schedule;
    if (exists) {
      // Pinned shifts survive a regenerate, so say so rather than warning
      // about losing work the GM has explicitly protected.
      const pinned = ps.shifts.filter((s) => s.locked).length;
      const ok = window.confirm(
        ps.rules.length > 0
          ? `Rebuild this month against the coverage rules? This replaces every unpinned shift.${
              pinned ? ` ${pinned} pinned shift${pinned === 1 ? "" : "s"} will be kept.` : ""
            }`
          : "Regenerate this month from everyone's weekly availability? This replaces all shifts for the month, including manual edits.",
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      await ps.generateMonth(exists);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ps.shifts, monthDate, dismissedMap]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayOpen, ps.shifts, dismissedMap]);

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
            <p className="text-xs text-muted-foreground">
              {area === "pro_shop"
                ? "Rec aids & golf ops — days & hours"
                : "Grounds crew & mechanic — days & hours"}
            </p>
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
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleGenerate} disabled={busy || ps.staff.length === 0}>
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
                {shortDate(slot.date)} · {slot.group === "inside" ? "golf ops" : "rec aid"}{" "}
                {compactTime(slot.start)}-{compactTime(slot.end)} — {slot.reason.toLowerCase()}
              </li>
            ))}
            {ps.unfilled.length > 6 && <li>…and {ps.unfilled.length - 6} more</li>}
          </ul>
          <p className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
            Free someone up, clear another rec aid to cover golf ops, or lower the count in Coverage.
          </p>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sun className="w-3.5 h-3.5 text-amber-500" /> Outside (rec aids)
        </span>
        <span className="flex items-center gap-1.5">
          <Moon className="w-3.5 h-3.5 text-indigo-500" /> Inside (golf ops)
        </span>
        <span className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Pinned · drag a shift to another day
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
          const out = dayShifts.filter((s) => s.group === "outside");
          const ins = dayShifts.filter((s) => s.group === "inside");
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
                {warns.length > 0 && <AlertTriangle className="w-3 h-3 text-red-500" />}
              </div>
              {inMonth && (
                <div className="relative space-y-px">
                  {out.map(line)}
                  {ins.length > 0 && out.length > 0 && <div className="h-px bg-border my-0.5" />}
                  {ins.map(line)}
                  {/* A shift with nobody on it, shown rather than left blank —
                      it prints with a line to write a name on. */}
                  {openOn(ds).map((slot, i) => (
                    <div
                      key={`open-${i}`}
                      className="flex items-center gap-1 text-[10px] leading-tight px-1 rounded text-muted-foreground"
                      title={`Open ${slot.group === "inside" ? "golf ops" : "rec aid"} shift`}
                    >
                      <span className="tabular-nums">
                        {compactTime(slot.start)}-{compactTime(slot.end)}
                      </span>
                      <span className="flex-1 border-b border-dashed border-muted-foreground/60" />
                    </div>
                  ))}
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
          <div className="grid sm:grid-cols-2 gap-2">
            {ps.staff.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border"
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-white ${
                    positionGroup(s.position) === "inside" ? "bg-indigo-500" : "bg-amber-500"
                  }`}
                >
                  {positionGroup(s.position) === "inside" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {s.full_name}
                    {!s.is_active && <span className="text-xs text-muted-foreground font-normal"> · inactive</span>}
                    {/* Paid hours for the whole month, next to the name. */}
                    <span className="ml-auto shrink-0 text-xs tabular-nums font-semibold">
                      {formatHours(hours.totalByStaff.get(s.id) ?? 0)}h
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {s.position === "golf_ops_assistant" ? "Golf Ops Assistant" : "Rec Aid"}
                    <span className="text-muted-foreground/70"> · this month</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">{summarizeWeekly(s)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAvailabilityStaff(s)}>
                      <Pencil className="w-3 h-3" /> Availability
                    </Button>
                    {/* Only a rec aid the GM ticks here may be pulled inside. */}
                    {s.position === "rec_aid" && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-sky-600"
                          checked={s.flex === true}
                          onChange={(e) => void ps.setStaffFlex(s.id, e.target.checked)}
                        />
                        Can cover golf ops
                      </label>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Day editor ────────────────────────────────────────────────────── */}
      {dayOpen && (
        <Overlay title={shortDate(dayOpen)} onClose={() => setDayOpen(null)}>
          <DayEditor
            date={dayOpen}
            shifts={shiftsOn(dayOpen)}
            staffById={ps.staffById}
            activeIssues={openDayWarnings.active}
            dismissedIssues={openDayWarnings.dismissed}
            onDismiss={(code) => ps.dismissWarning(dayOpen, code)}
            onRestore={(code) => ps.restoreWarning(dayOpen, code)}
            onEdit={(shift) => setEditShift({ mode: "edit", shift })}
            onAdd={() => setEditShift({ mode: "new", date: dayOpen })}
            onCover={() => setCoverDate({ date: dayOpen })}
          />
        </Overlay>
      )}

      {/* ── Shift add/edit ────────────────────────────────────────────────── */}
      {editShift && (
        <ShiftEditor
          state={editShift}
          staff={ps.staff}
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
        <AddStaffSheet onClose={() => setAddStaffOpen(false)} addStaff={ps.addStaff} />
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
}: {
  shift: ProShopShift;
  name: string;
  /** Week-to-date paid hours for this person through this shift's day. */
  runningHours?: string;
  onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-1 truncate text-[10px] leading-tight px-1 rounded ${
        shift.group === "inside" ? "text-indigo-700 dark:text-indigo-300" : "text-amber-800 dark:text-amber-300"
      } ${onDragStart ? "cursor-grab active:cursor-grabbing hover:bg-muted" : ""}`}
      title={[
        shift.note,
        shift.locked ? "Pinned — Regenerate will not move this" : null,
        runningHours ? `${runningHours}h this week through today` : null,
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

function ShiftGroupList({
  title,
  list,
  staffById,
  onEdit,
  icon,
}: {
  title: string;
  list: ProShopShift[];
  staffById: Record<string, ProShopStaff>;
  onEdit: (s: ProShopShift) => void;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1">
        {icon} {title}
      </p>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No one scheduled</p>
      ) : (
        <div className="space-y-1">
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => onEdit(s)}
              className="w-full flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted text-left"
            >
              <span className="text-sm tabular-nums w-24 shrink-0">
                {compactTime(s.start_time)}-{compactTime(s.end_time)}
              </span>
              <span className="text-sm font-medium flex-1 truncate">
                {staffById[s.staff_id]?.full_name ?? "Unknown"}
              </span>
              {s.note && <span className="text-[10px] text-muted-foreground truncate max-w-[7rem]">{s.note}</span>}
              <Pencil className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DayEditor({
  date,
  shifts,
  staffById,
  activeIssues,
  dismissedIssues,
  onDismiss,
  onRestore,
  onEdit,
  onAdd,
  onCover,
}: {
  date: string;
  shifts: ProShopShift[];
  staffById: Record<string, ProShopStaff>;
  activeIssues: DayWarning[];
  dismissedIssues: DayWarning[];
  onDismiss: (code: WarningCode) => void;
  onRestore: (code: WarningCode) => void;
  onEdit: (s: ProShopShift) => void;
  onAdd: () => void;
  onCover: () => void;
}) {
  const out = shifts.filter((s) => s.group === "outside");
  const ins = shifts.filter((s) => s.group === "inside");
  void date;

  return (
    <div className="p-4 space-y-4">
      {/* Needs attention — the specific coverage issues + how to clear them. */}
      {(activeIssues.length > 0 || dismissedIssues.length > 0) && (
        <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 space-y-2">
          {activeIssues.length > 0 && (
            <>
              <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Needs attention
              </p>
              <ul className="space-y-1.5">
                {activeIssues.map((w) => (
                  <li key={w.code} className="flex items-start justify-between gap-2">
                    <span className="text-xs text-red-700 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {w.message}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDismiss(w.code)}
                      className="shrink-0 text-[11px] px-2 py-0.5 rounded-full border border-red-300 text-red-700 hover:bg-red-100 inline-flex items-center gap-1"
                      title="Bypass this — I'm fine with it"
                    >
                      <Ban className="w-3 h-3" /> Looks fine
                    </button>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-red-600/80">
                Fix by adding or covering a shift below — or dismiss an issue you&apos;re fine with.
              </p>
            </>
          )}
          {dismissedIssues.length > 0 && (
            <div className={activeIssues.length > 0 ? "pt-1.5 border-t border-red-200" : ""}>
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
      <ShiftGroupList
        title="Outside (rec aids)"
        list={out}
        staffById={staffById}
        onEdit={onEdit}
        icon={<Sun className="w-3.5 h-3.5 text-amber-500" />}
      />
      <ShiftGroupList
        title="Inside (golf ops)"
        list={ins}
        staffById={staffById}
        onEdit={onEdit}
        icon={<Moon className="w-3.5 h-3.5 text-indigo-500" />}
      />
      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onAdd}>
          <Plus className="w-4 h-4" /> Add shift
        </Button>
        <Button variant="outline" className="flex-1 gap-1.5" onClick={onCover}>
          <UserMinus className="w-4 h-4" /> Day off / cover
        </Button>
      </div>
    </div>
  );
}

function ShiftEditor({
  state,
  staff,
  onClose,
  addShift,
  updateShift,
  deleteShift,
}: {
  state: { mode: "new"; date: string } | { mode: "edit"; shift: ProShopShift };
  staff: ProShopStaff[];
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
    existing?.group ?? (staff[0] ? positionGroup(staff[0].position) : "outside"),
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
                {s.full_name} ({s.position === "golf_ops_assistant" ? "inside" : "outside"})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Group</Label>
          <select value={group} onChange={(e) => setGroup(e.target.value as ShiftGroup)} className={selectCls}>
            <option value="outside">Outside (rec aids)</option>
            <option value="inside">Inside (golf ops)</option>
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
            Paid hours: <strong className="text-foreground tabular-nums">{formatHours(paidMinutes(start, end))}h</strong>
            {paidMinutes(start, end) < elapsedMinutes(start, end) && " (30 min unpaid lunch deducted)"}
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
  onClose,
  addStaff,
}: {
  onClose: () => void;
  addStaff: (p: {
    full_name: string;
    position: "rec_aid" | "golf_ops_assistant";
    default_group: ShiftGroup;
    flex: boolean;
    phone?: string | null;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState<"rec_aid" | "golf_ops_assistant">("rec_aid");
  const [flex, setFlex] = useState(true);
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  function onPickPosition(p: "rec_aid" | "golf_ops_assistant") {
    setPosition(p);
    setFlex(p === "rec_aid"); // sensible default; user can override
  }

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
    <Overlay title="Add pro shop staff" onClose={onClose}>
      <div className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Full name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First Last" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Position</Label>
          <select
            value={position}
            onChange={(e) => onPickPosition(e.target.value as "rec_aid" | "golf_ops_assistant")}
            className={selectCls}
          >
            <option value="rec_aid">Rec Aid (outside)</option>
            <option value="golf_ops_assistant">Golf Ops Assistant (inside)</option>
          </select>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={flex} onChange={(e) => setFlex(e.target.checked)} className="w-4 h-4 mt-0.5" />
          <span>
            Flex employee
            <span className="block text-xs text-muted-foreground">Can cover any area (inside or outside) when needed.</span>
          </span>
        </label>
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
