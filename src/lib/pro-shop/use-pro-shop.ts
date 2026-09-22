"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  directSelectList,
  directRpc,
} from "@/lib/supabase/rest";
import type {
  CoverageRule,
  DayGroupOverride,
  DayOverrides,
  ProShopPosition,
  ProShopSchedule,
  ProShopShift,
  ProShopStaff,
  ProShopTimeOff,
  ScheduleArea,
  ScheduleSettings,
  ShiftGroup,
  TimeRange,
  WarningCode,
  WeeklyAvailability,
  WeekHours,
  WeekSlot,
  WeekTemplate,
} from "./types";
import { DEFAULT_SCHEDULE_SETTINGS, SCHEDULE_AREA_LABELS } from "./types";
import { datesInMonth, expandMonth, parseYmd, ymd } from "./schedule-engine";
import { generateCoverageMonth, type UnfilledSlot } from "./coverage";
import {
  clearDayOverride,
  isDayLocked,
  sanitizeDayOverrides,
  withDayCounts,
  withDayLocked,
  withDayUnstaffed,
  withSlotRemoved,
} from "./day-overrides";
import { sanitizeTemplate, stampFromWeek, versionFor } from "./week-template";

/** Manual shift edit payload. */
export interface ShiftInput {
  staff_id: string;
  shift_date: string;
  group: ShiftGroup;
  start_time: string; // "HH:MM"
  end_time: string;
  note?: string | null;
  source?: "template" | "ai" | "manual";
  /**
   * Pin it so a refill rebuilds the month around it. Defaults to pinned: a
   * shift added by hand is a decision, and a refill must not quietly undo it.
   */
  locked?: boolean;
  /** The standard-week slot this shift fills, when it fills one. */
  slot_id?: string | null;
}

/** What a standard-week change did to the months already on the calendar. */
export interface RestampResult {
  /** Dates rebuilt from the standard week. */
  days: number;
  /** Months touched, as first-of-month dates. */
  months: string[];
  /** Days skipped because they are held. */
  held: number;
}

function firstOfMonth(year: number, month0: number): string {
  return ymd(new Date(year, month0, 1));
}
function lastOfMonth(year: number, month0: number): string {
  return ymd(new Date(year, month0 + 1, 0));
}

/**
 * @param area Which schedule to load. The two areas are entirely separate —
 *   separate staff, months, shifts and time-off — so every read is filtered by
 *   it and every write stamps it.
 */
export function useProShop(
  initialYear: number,
  initialMonth0: number,
  area: ScheduleArea = "pro_shop",
) {
  const [year, setYear] = useState(initialYear);
  const [month0, setMonth0] = useState(initialMonth0);

  const [staff, setStaff] = useState<ProShopStaff[]>([]);
  const [schedules, setSchedules] = useState<ProShopSchedule[]>([]);
  const [shifts, setShifts] = useState<ProShopShift[]>([]);
  const [timeOff, setTimeOff] = useState<ProShopTimeOff[]>([]);
  const [rules, setRules] = useState<CoverageRule[]>([]);
  /** The area's standard week, every dated version, oldest first. */
  const [templates, setTemplates] = useState<WeekTemplate[]>([]);
  const [settings, setSettings] = useState<ScheduleSettings>({
    area,
    ...DEFAULT_SCHEDULE_SETTINGS,
  });
  /** Slots the last generate could not fill — a real hole, not a silent drop. */
  const [unfilled, setUnfilled] = useState<UnfilledSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    const [rows, cfg] = await Promise.all([
      directSelectList<CoverageRule>("pro_shop_coverage_rules", {
        columns: "*",
        filters: [`area=eq.${area}`],
        orderBy: [{ column: "weekday", ascending: true }],
        label: "proshop.coverage.rules",
      }),
      directSelectList<ScheduleSettings>("pro_shop_schedule_settings", {
        columns: "*",
        filters: [`area=eq.${area}`],
        label: "proshop.coverage.settings",
      }),
    ]);
    setRules(rows);
    setSettings(cfg[0] ?? { area, ...DEFAULT_SCHEDULE_SETTINGS });
    return { rules: rows, settings: cfg[0] ?? { area, ...DEFAULT_SCHEDULE_SETTINGS } };
  }, [area]);

  const loadTemplates = useCallback(async () => {
    const rows = await directSelectList<unknown>("pro_shop_week_templates", {
      columns: "*",
      filters: [`area=eq.${area}`],
      orderBy: [{ column: "effective_from", ascending: true }],
      label: "proshop.week-templates",
    });
    const clean = rows.map(sanitizeTemplate).filter((t): t is WeekTemplate => !!t);
    setTemplates(clean);
    return clean;
  }, [area]);

  const loadStatic = useCallback(async () => {
    const [st, sch, off] = await Promise.all([
      directSelectList<ProShopStaff>("pro_shop_staff", {
        columns: "*",
        filters: [`area=eq.${area}`],
        orderBy: [{ column: "sort_order", ascending: true }],
        label: "proshop.staff",
      }),
      directSelectList<ProShopSchedule>("pro_shop_schedules", {
        columns: "*",
        filters: [`area=eq.${area}`],
        orderBy: [{ column: "month", ascending: false }],
        label: "proshop.schedules",
      }),
      directSelectList<ProShopTimeOff>("pro_shop_time_off", {
        columns: "*",
        filters: ["is_active=eq.true"],
        orderBy: [{ column: "start_date", ascending: true }],
        label: "proshop.timeoff",
      }),
    ]);
    setStaff(st);
    setSchedules(sch);
    setTimeOff(off);
  }, [area]);

  const loadShifts = useCallback(async () => {
    const first = firstOfMonth(year, month0);
    const last = lastOfMonth(year, month0);
    const rows = await directSelectList<ProShopShift>("pro_shop_shifts", {
      columns: "*",
      filters: [`shift_date=gte.${first}`, `shift_date=lte.${last}`, "is_active=eq.true", `area=eq.${area}`],
      orderBy: [
        { column: "shift_date", ascending: true },
        { column: "start_time", ascending: true },
      ],
      label: "proshop.shifts",
    });
    setShifts(rows);
  }, [year, month0, area]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadStatic(), loadShifts(), loadRules(), loadTemplates()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the schedule.");
    } finally {
      setLoading(false);
    }
  }, [loadStatic, loadShifts, loadRules, loadTemplates]);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Derived: the schedule row for the selected month, if any ──────────────
  const monthKey = firstOfMonth(year, month0);
  const schedule = useMemo(
    () => schedules.find((s) => s.month === monthKey) ?? null,
    [schedules, monthKey],
  );

  const staffById = useMemo(() => {
    const m: Record<string, ProShopStaff> = {};
    for (const s of staff) m[s.id] = s;
    return m;
  }, [staff]);

  /**
   * Per-day coverage exceptions for the open month. Sanitized on the way in:
   * the column is schemaless JSONB, and a malformed entry must not be able to
   * quietly blank out a day's required staffing.
   */
  const dayOverrides = useMemo<DayOverrides>(
    () => sanitizeDayOverrides(schedule?.day_overrides),
    [schedule],
  );

  /**
   * The month's schedule row, created if this is the first thing to need it.
   * Day overrides live on that row, so setting one on a month that has never
   * been generated has to bring the row into existence first.
   */
  const ensureSchedule = useCallback(async (): Promise<ProShopSchedule> => {
    const existing = schedules.find((s) => s.month === monthKey);
    if (existing) return existing;
    const title = `${new Date(year, month0, 1).toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    })} ${SCHEDULE_AREA_LABELS[area]} Schedule`;
    const created = await directRpc<ProShopSchedule>(
      "save_pro_shop_schedule",
      {
        p_schedule_id: null,
        p_values: { month: monthKey, title, area },
        p_reason: "Monthly pro-shop schedule created",
      },
      "proshop.schedule.create",
    );
    await loadStatic();
    return created;
  }, [schedules, monthKey, year, month0, area, loadStatic]);

  /**
   * Write the whole overrides map back. Every edit goes through here so the
   * optimistic local update and the saved row can never diverge in shape.
   */
  const saveDayOverrides = useCallback(
    async (next: DayOverrides, reason: string) => {
      const sched = await ensureSchedule();
      setSchedules((prev) =>
        prev.map((s) => (s.id === sched.id ? { ...s, day_overrides: next } : s)),
      );
      try {
        await directRpc("save_pro_shop_schedule", {
          p_schedule_id: sched.id,
          p_values: { day_overrides: next },
          p_reason: reason,
        }, "proshop.schedule.day-overrides");
      } catch (e) {
        console.error("[pro-shop] day override save failed:", e);
        await loadStatic();
        throw e;
      }
    },
    [ensureSchedule, loadStatic],
  );

  /** Set (or clear, with null) how many people one group needs on one date. */
  const setDayCounts = useCallback(
    async (date: string, group: ShiftGroup, counts: DayGroupOverride | null) => {
      const next = withDayCounts(dayOverrides, date, group, counts);
      await saveDayOverrides(
        next,
        counts
          ? `Coverage for ${date} set to ${counts.base} base + ${counts.extra} extra`
          : `Coverage for ${date} returned to the weekday rule`,
      );
    },
    [dayOverrides, saveDayOverrides],
  );

  /**
   * Say a stretch of one day needs nobody (or take that back).
   *
   * @param needed false to excuse the stretch, true to want cover there again.
   */
  const setDayUnstaffed = useCallback(
    async (date: string, group: ShiftGroup, range: TimeRange, needed: boolean) => {
      await saveDayOverrides(
        withDayUnstaffed(dayOverrides, date, group, range, needed),
        needed
          ? `${range.start}-${range.end} on ${date} needs cover again`
          : `${range.start}-${range.end} on ${date} marked as needing nobody`,
      );
    },
    [dayOverrides, saveDayOverrides],
  );

  /**
   * Excuse the same stretch on several dates at once — the "and the other six
   * days with this gap" button. One write, so the month cannot end up half
   * applied if the tab is closed mid-way.
   */
  const setManyDaysUnstaffed = useCallback(
    async (dates: string[], group: ShiftGroup, range: TimeRange) => {
      let next = dayOverrides;
      for (const date of dates) next = withDayUnstaffed(next, date, group, range, false);
      await saveDayOverrides(
        next,
        `${range.start}-${range.end} marked as needing nobody on ${dates.length} days`,
      );
    },
    [dayOverrides, saveDayOverrides],
  );

  /** Hold a whole day as-is: no rebuild touches any shift on it. */
  const setDayLock = useCallback(
    async (date: string, locked: boolean) => {
      await saveDayOverrides(
        withDayLocked(dayOverrides, date, locked),
        locked ? `${date} locked against rebuilds` : `${date} unlocked`,
      );
    },
    [dayOverrides, saveDayOverrides],
  );

  /** Drop every exception on a date — back to a normal weekday. */
  const resetDay = useCallback(
    async (date: string) => {
      await saveDayOverrides(
        clearDayOverride(dayOverrides, date),
        `${date} returned to the standard weekday coverage`,
      );
    },
    [dayOverrides, saveDayOverrides],
  );

  // ── Availability ──────────────────────────────────────────────────────────
  const saveAvailability = useCallback(
    async (
      staffId: string,
      availability: WeeklyAvailability,
      availabilityText: string,
    ) => {
      await directRpc(
        "save_pro_shop_staff",
        {
          p_staff_id: staffId,
          p_values: { availability, availability_text: availabilityText },
          p_reason: "Weekly availability updated",
        },
        "proshop.staff.availability",
      );
      await loadStatic();
    },
    [loadStatic],
  );

  const addStaff = useCallback(
    async (payload: {
      full_name: string;
      position: ProShopPosition;
      default_group: ShiftGroup;
      flex?: boolean;
      phone?: string | null;
    }) => {
      const maxSort = staff.reduce((m, s) => Math.max(m, s.sort_order), 0);
      await directRpc(
        "save_pro_shop_staff",
        {
          p_staff_id: null,
          p_values: {
          full_name: payload.full_name,
          position: payload.position,
          default_group: payload.default_group,
          // Rec aids default to flex (cover any area); golf ops do not.
          flex: payload.flex ?? payload.position === "rec_aid",
          phone: payload.phone ?? null,
          sort_order: maxSort + 1,
          availability: { weekly: {}, notes: "" },
          area,
          },
          p_reason: "Roster member added",
        },
        "proshop.staff.add",
      );
      await loadStatic();
    },
    [staff, loadStatic, area],
  );

  /**
   * Retire every future shift already stamped past someone's last working day.
   *
   * Setting a leaving date only stops FUTURE generation; months already
   * generated still hold their shifts. Without this the leaver stays on the
   * printed schedule for every month that was generated before they gave
   * notice — which is exactly the bug this feature exists to fix.
   */
  const retireShiftsAfter = useCallback(
    async (staffId: string, lastDay: string) => {
      const doomed = await directSelectList<ProShopShift>("pro_shop_shifts", {
        columns: "id",
        filters: [`staff_id=eq.${staffId}`, `shift_date=gt.${lastDay}`, "is_active=eq.true"],
        label: "proshop.shifts.after-last-day",
      });
      for (const shift of doomed) {
        await directRpc("retire_pro_shop_shift", {
          p_shift_id: shift.id,
          p_reason: "Past the employee's last working day",
        }, "proshop.shift.retire-after-last-day");
      }
      return doomed.length;
    },
    [],
  );

  const updateStaff = useCallback(
    async (staffId: string, patch: Partial<ProShopStaff>) => {
      await directRpc("save_pro_shop_staff", {
        p_staff_id: staffId,
        p_values: patch,
        p_reason: "Pro-shop roster member updated",
      }, "proshop.staff.update");
      await loadStatic();
    },
    [loadStatic],
  );

  // ── Month generation (deterministic) ──────────────────────────────────────
  /**
   * Rebuild the schedule and stamp it into the month.
   *
   * @param replace Retire the shifts this run supersedes, rather than adding to them.
   * @param scope   Restrict the rebuild to these dates. Omitted, the whole month
   *   is rebuilt, which is what Regenerate has always done. Either way LOCKED
   *   DAYS ARE DROPPED from the window before anything is retired — that is what
   *   makes a locked day survive a full-month Regenerate, not just a scoped one.
   */
  const generateMonth = useCallback(
    async (
      replace: boolean,
      scope?: { dates?: string[] },
    ): Promise<{ inserted: number; rebuiltDates: string[]; skippedLocked: string[] }> => {
      const sched = await ensureSchedule();
      // Read staff + time-off FRESH so a change applied moments earlier (e.g. the
      // AI quick-update) is reflected — the closed-over state may be a render behind.
      const [freshStaff, freshTimeOff] = await Promise.all([
        directSelectList<ProShopStaff>("pro_shop_staff", {
          columns: "*",
          // MUST stay area-filtered: without it a month generated for one area
          // would stamp the other area's staff into it.
          filters: ["is_active=eq.true", `area=eq.${area}`],
          orderBy: [{ column: "sort_order", ascending: true }],
          label: "proshop.staff.fresh",
        }),
        directSelectList<ProShopTimeOff>("pro_shop_time_off", {
          columns: "*",
          filters: ["is_active=eq.true"],
          orderBy: [{ column: "start_date", ascending: true }],
          label: "proshop.timeoff.fresh",
        }),
      ]);
      // Coverage rules describe what the day REQUIRES, so when this area has
      // them the generator fills the day. An area with no rules (the
      // maintenance crew) keeps stamping standing weekly patterns exactly as
      // before — that schedule is not run to a coverage target.
      const fresh = await loadRules();

      // The exact days this run will touch. Both halves of the operation are
      // held to this list — the generator builds only these, and the RPC is
      // told to retire only within them — so a day left out of scope, or
      // locked, keeps every shift it already has.
      const monthDates = datesInMonth(year, month0);
      const requested = scope?.dates
        ? monthDates.filter((date) => scope.dates!.includes(date))
        : monthDates;
      const skippedLocked = requested.filter((date) => isDayLocked(date, dayOverrides));
      const rebuiltDates = requested.filter((date) => !isDayLocked(date, dayOverrides));
      const inScope = new Set(rebuiltDates);

      let rows: Array<{
        staff_id: string; shift_date: string; group: ShiftGroup;
        start_time: string; end_time: string; source: string; slot_id?: string;
      }>;
      const versions = await loadTemplates();
      if (versions.length > 0) {
        // The standard week is the schedule. A date before the first version
        // has nothing to stamp, so it is left exactly as it is.
        const stampable = rebuiltDates.filter((date) => !!versionFor(date, versions));
        rebuiltDates.splice(0, rebuiltDates.length, ...stampable);
        const locked = await directSelectList<ProShopShift>("pro_shop_shifts", {
          columns: "staff_id,shift_date,slot_id",
          filters: [
            `shift_date=gte.${firstOfMonth(year, month0)}`,
            `shift_date=lte.${lastOfMonth(year, month0)}`,
            "is_active=eq.true", "locked=eq.true", `area=eq.${area}`,
          ],
          label: "proshop.shifts.locked",
        });
        setUnfilled([]);
        rows = stampFromWeek({
          dates: stampable, versions, staff: freshStaff, timeOff: freshTimeOff,
          lockedShifts: locked, overrides: dayOverrides,
        });
      } else if (fresh.rules.length > 0) {
        // A locked shift is a decision already made: it holds its slot and its
        // person's day, and the rest of the month is built around it.
        const locked = await directSelectList<ProShopShift>("pro_shop_shifts", {
          columns: "*",
          filters: [
            `shift_date=gte.${firstOfMonth(year, month0)}`,
            `shift_date=lte.${lastOfMonth(year, month0)}`,
            "is_active=eq.true", "locked=eq.true", `area=eq.${area}`,
          ],
          label: "proshop.shifts.locked",
        });
        const plan = generateCoverageMonth({
          staff: freshStaff, year, month0, timeOff: freshTimeOff,
          rules: fresh.rules, settings: fresh.settings, lockedShifts: locked, area,
          overrides: dayOverrides, dates: rebuiltDates,
        });
        setUnfilled(plan.unfilled);
        rows = plan.shifts.map((p) => ({
          staff_id: p.staff_id, shift_date: p.shift_date, group: p.group,
          start_time: p.start_time, end_time: p.end_time, source: p.source,
        }));
      } else {
        setUnfilled([]);
        // The pattern-stamping path knows nothing about scope, so trim it here.
        rows = expandMonth(freshStaff, year, month0, freshTimeOff)
          .filter((p) => inScope.has(p.shift_date))
          .map((p) => ({
          staff_id: p.staff_id, shift_date: p.shift_date, group: p.group,
          start_time: p.start_time, end_time: p.end_time, source: p.source,
        }));
      }
      await directRpc("replace_pro_shop_schedule_shifts", {
        p_schedule_id: sched.id,
        p_rows: rows,
        p_replace: replace,
        p_reason: replace
          ? "Monthly schedule regenerated and prior active shifts replaced"
          : "Monthly schedule generated without replacing unmatched shifts",
        // Always sent, never left null: a locked day is only safe from a
        // full-month Regenerate because it is absent from this list.
        p_dates: rebuiltDates,
      }, "proshop.shifts.generate");
      await Promise.all([loadStatic(), loadShifts()]);
      return { inserted: rows.length, rebuiltDates, skippedLocked };
    },
    [ensureSchedule, year, month0, loadStatic, loadShifts, loadRules, loadTemplates, area, dayOverrides],
  );

  /**
   * Rebuild dates in ANY month of this area from the standard week — what a
   * standard-week change does to the months already on the calendar. Only
   * months that already exist are touched; a month nobody has opened yet is
   * filled when it is generated.
   */
  const restampFrom = useCallback(
    async (fromDate: string, versions: WeekTemplate[]): Promise<RestampResult> => {
      const monthRows = await directSelectList<ProShopSchedule>("pro_shop_schedules", {
        columns: "*",
        filters: [`area=eq.${area}`, `month=gte.${fromDate.slice(0, 7)}-01`],
        orderBy: [{ column: "month", ascending: true }],
        label: "proshop.schedules.restamp",
      });
      if (monthRows.length === 0) return { days: 0, months: [], held: 0 };
      const [freshStaff, freshTimeOff] = await Promise.all([
        directSelectList<ProShopStaff>("pro_shop_staff", {
          columns: "*",
          filters: ["is_active=eq.true", `area=eq.${area}`],
          label: "proshop.staff.fresh",
        }),
        directSelectList<ProShopTimeOff>("pro_shop_time_off", {
          columns: "*",
          filters: ["is_active=eq.true"],
          label: "proshop.timeoff.fresh",
        }),
      ]);
      let days = 0;
      let held = 0;
      const months: string[] = [];
      for (const sched of monthRows) {
        const first = parseYmd(sched.month);
        const overrides = sanitizeDayOverrides(sched.day_overrides);
        const inMonth = datesInMonth(first.getFullYear(), first.getMonth())
          .filter((date) => date >= fromDate && !!versionFor(date, versions));
        const dates = inMonth.filter((date) => !isDayLocked(date, overrides));
        held += inMonth.length - dates.length;
        if (dates.length === 0) continue;
        const locked = await directSelectList<ProShopShift>("pro_shop_shifts", {
          columns: "staff_id,shift_date,slot_id",
          filters: [
            `shift_date=gte.${dates[0]}`, `shift_date=lte.${dates[dates.length - 1]}`,
            "is_active=eq.true", "locked=eq.true", `area=eq.${area}`,
          ],
          label: "proshop.shifts.locked",
        });
        const rows = stampFromWeek({
          dates, versions, staff: freshStaff, timeOff: freshTimeOff, lockedShifts: locked, overrides,
        });
        await directRpc("replace_pro_shop_schedule_shifts", {
          p_schedule_id: sched.id,
          p_rows: rows,
          p_replace: true,
          p_reason: `Standard week applied from ${fromDate}`,
          p_dates: dates,
        }, "proshop.shifts.restamp");
        days += dates.length;
        months.push(sched.month);
      }
      await Promise.all([loadStatic(), loadShifts()]);
      return { days, months, held };
    },
    [area, loadStatic, loadShifts],
  );

  /**
   * Save the standard week as it should be from `effectiveFrom` on, then
   * rebuild every existing day from that date forward to match. Weeks before
   * the date are never touched.
   */
  const saveWeekTemplate = useCallback(
    async (
      week: { slots: WeekSlot[]; hours: WeekHours },
      effectiveFrom: string,
    ): Promise<RestampResult> => {
      await directRpc("save_pro_shop_week_template", {
        p_area: area,
        p_effective_from: effectiveFrom,
        p_slots: week.slots,
        p_hours: week.hours,
      }, "proshop.week-template.save");
      const versions = await loadTemplates();
      return restampFrom(effectiveFrom, versions);
    },
    [area, loadTemplates, restampFrom],
  );

  /**
   * Cancel a dated change. The days it covered go back to the version before
   * it. The first version can't be cancelled — with nothing before it the
   * rebuild would empty those days.
   */
  const deleteWeekTemplate = useCallback(
    async (template: WeekTemplate): Promise<RestampResult> => {
      const earliest = templates.reduce<string | null>(
        (min, t) => (!min || t.effective_from < min ? t.effective_from : min), null,
      );
      if (template.effective_from === earliest) {
        throw new Error("The first standard week can't be removed — edit it instead.");
      }
      await directRpc("delete_pro_shop_week_template", { p_id: template.id }, "proshop.week-template.delete");
      const versions = await loadTemplates();
      return restampFrom(template.effective_from, versions);
    },
    [templates, loadTemplates, restampFrom],
  );

  const setScheduleNotes = useCallback(
    async (scheduleId: string, notes: string) => {
      await directRpc("save_pro_shop_schedule", {
        p_schedule_id: scheduleId,
        p_values: { notes },
        p_reason: "Schedule notes updated",
      }, "proshop.schedule.notes");
      await loadStatic();
    },
    [loadStatic],
  );

  /** Publish the month and drop a "rebuild next month" reminder on the calendar. */
  const publishMonth = useCallback(
    async (scheduleId: string) => {
      // Reminder to build the *next* month, dated ~5 days before this month ends.
      const next = new Date(year, month0 + 1, 1);
      const nextLabel = next.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      const remindOn = ymd(new Date(year, month0 + 1, 0)); // last day of current month
      const remindDate = ymd(new Date(year, month0 + 1, 0 - 4)); // 5 days before end
      void remindOn;
      const title = `Update Pro Shop Schedule — ${nextLabel}`;
      await directRpc("publish_pro_shop_schedule", {
        p_schedule_id: scheduleId,
        p_reminder_date: remindDate,
        p_reminder_title: title,
        p_reminder_notes: `Build the ${nextLabel} pro shop schedule and publish it.`,
      }, "proshop.schedule.publish");
      await loadStatic();
    },
    [year, month0, loadStatic],
  );

  // ── Manual shift edits ────────────────────────────────────────────────────
  const addShift = useCallback(
    async (input: ShiftInput) => {
      const sched = schedules.find((s) => s.month === monthKey) ?? null;
      await directRpc(
        "save_pro_shop_shift",
        {
          p_shift_id: null,
          p_values: {
          schedule_id: sched?.id ?? null,
          staff_id: input.staff_id,
          shift_date: input.shift_date,
          group: input.group,
          start_time: input.start_time,
          end_time: input.end_time,
          note: input.note ?? null,
          source: input.source ?? "manual",
          locked: input.locked ?? true,
          ...(input.slot_id ? { slot_id: input.slot_id } : {}),
          // area is derived from the schedule inside save_pro_shop_shift.
          },
          p_reason: "Manual pro-shop shift added",
        },
        "proshop.shift.add",
      );
      await loadShifts();
    },
    [schedules, monthKey, loadShifts],
  );

  const updateShift = useCallback(
    async (shiftId: string, patch: Partial<ProShopShift>) => {
      await directRpc("save_pro_shop_shift", {
        p_shift_id: shiftId,
        // A hand edit pins itself unless the caller says otherwise, or the
        // next refill from the standard week would put it straight back.
        p_values: { locked: true, ...patch },
        p_reason: "Pro-shop shift updated",
      }, "proshop.shift.update");
      await loadShifts();
    },
    [loadShifts],
  );

  /**
   * A shift taken off by hand stays off: when it came from the standard week,
   * the date remembers that slot is removed, or the next refill would put the
   * shift straight back.
   */
  const rememberSlotRemoved = useCallback(
    async (date: string, slotId: string) => {
      if (templates.length === 0) return;
      const sched = schedules.find((s) => s.month === `${date.slice(0, 7)}-01`);
      if (!sched) return;
      const current = sanitizeDayOverrides(sched.day_overrides);
      const next = withSlotRemoved(current, date, slotId, true);
      setSchedules((prev) => prev.map((s) => (s.id === sched.id ? { ...s, day_overrides: next } : s)));
      await directRpc("save_pro_shop_schedule", {
        p_schedule_id: sched.id,
        p_values: { day_overrides: next },
        p_reason: `Standard-week shift removed from ${date}`,
      }, "proshop.schedule.slot-removed");
    },
    [templates, schedules],
  );

  const deleteShift = useCallback(
    async (shiftId: string) => {
      const shift = shifts.find((s) => s.id === shiftId);
      await directRpc("retire_pro_shop_shift", {
        p_shift_id: shiftId,
        p_reason: "Shift removed from the active schedule",
      }, "proshop.shift.retire");
      if (shift?.slot_id) await rememberSlotRemoved(shift.shift_date, shift.slot_id);
      await loadShifts();
    },
    [shifts, rememberSlotRemoved, loadShifts],
  );

  /**
   * Move a shift to another day and/or another person — the drag-and-drop
   * backing. Moving it by hand implies the GM wants it kept, so the moved
   * shift is locked; otherwise the next Regenerate would put it straight back.
   */
  const moveShift = useCallback(
    async (shiftId: string, to: { shift_date?: string; staff_id?: string; group?: ShiftGroup }) => {
      const shift = shifts.find((s) => s.id === shiftId);
      await directRpc("save_pro_shop_shift", {
        p_shift_id: shiftId,
        p_values: { ...to, locked: true },
        p_reason: "Shift moved by hand on the schedule board",
      }, "proshop.shift.move");
      // Moved off its own day: that day's slot is now deliberately empty.
      if (shift?.slot_id && to.shift_date && to.shift_date !== shift.shift_date) {
        await rememberSlotRemoved(shift.shift_date, shift.slot_id);
      }
      await loadShifts();
    },
    [shifts, rememberSlotRemoved, loadShifts],
  );

  /**
   * Change a shift's person and/or hours. `everyWeek` changes the standard
   * week from this date on — and any later dated change that still had the
   * old value in that slot — then rebuilds those days. Otherwise it is this
   * date only, and the edit is pinned so a refill keeps it.
   */
  const changeShift = useCallback(
    async (
      shift: ProShopShift,
      patch: { staff_id?: string; start_time?: string; end_time?: string },
      everyWeek: boolean,
    ): Promise<RestampResult | null> => {
      if (!everyWeek) {
        await directRpc("save_pro_shop_shift", {
          p_shift_id: shift.id,
          p_values: { ...patch, locked: true },
          p_reason: patch.staff_id ? "Shift given to someone else for this day" : "Shift hours changed for this day",
        }, "proshop.shift.change");
        await loadShifts();
        return null;
      }
      const current = versionFor(shift.shift_date, templates);
      const slot = current?.slots.find((s) => s.id === shift.slot_id);
      if (!current || !slot) {
        throw new Error("That shift isn't part of the standard week, so it can only be changed for this day.");
      }
      if (patch.staff_id && current.slots.some(
        (s) => s.weekday === slot.weekday && s.staff_id === patch.staff_id && s.id !== slot.id,
      )) {
        const who = staff.find((p) => p.id === patch.staff_id)?.full_name ?? "That person";
        throw new Error(`${who} already has a shift that day in the standard week.`);
      }
      const next: Partial<WeekSlot> = {
        ...(patch.staff_id ? { staff_id: patch.staff_id } : {}),
        ...(patch.start_time ? { start: patch.start_time.slice(0, 5) } : {}),
        ...(patch.end_time ? { end: patch.end_time.slice(0, 5) } : {}),
      };
      // In a later version, only a slot still holding what this one held is
      // changed — a later version that already moved it on keeps its own value.
      const apply = (t: WeekTemplate) => t.slots.map((s) => {
        if (s.id !== slot.id) return s;
        const out = { ...s };
        if (next.staff_id && s.staff_id === slot.staff_id) out.staff_id = next.staff_id;
        if (next.start && s.start === slot.start) out.start = next.start;
        if (next.end && s.end === slot.end) out.end = next.end;
        return out;
      });
      // The standard week first: if anything after it fails, the change is
      // still recorded and the next refill applies it.
      await directRpc("save_pro_shop_week_template", {
        p_area: area, p_effective_from: shift.shift_date, p_slots: apply(current), p_hours: current.hours,
      }, "proshop.week-template.change");
      for (const later of templates.filter((t) => t.effective_from > shift.shift_date)) {
        if (!later.slots.some((s) => s.id === slot.id)) continue;
        await directRpc("save_pro_shop_week_template", {
          p_area: area, p_effective_from: later.effective_from, p_slots: apply(later), p_hours: later.hours,
        }, "proshop.week-template.change");
      }
      // The shift in hand is unpinned so the rebuild replaces it with the new
      // standard-week version of itself (a pinned one would be kept as-is).
      if (shift.locked) {
        await directRpc("save_pro_shop_shift", {
          p_shift_id: shift.id, p_values: { locked: false },
          p_reason: "Shift changed in the standard week",
        }, "proshop.shift.change");
      }
      const versions = await loadTemplates();
      return restampFrom(shift.shift_date, versions);
    },
    [area, templates, staff, loadShifts, loadTemplates, restampFrom],
  );

  /** Pin a shift so Regenerate rebuilds the month around it. */
  const setShiftLocked = useCallback(
    async (shiftId: string, locked: boolean) => {
      await directRpc("save_pro_shop_shift", {
        p_shift_id: shiftId,
        p_values: { locked },
        p_reason: locked ? "Shift pinned against regeneration" : "Shift unpinned",
      }, "proshop.shift.lock");
      await loadShifts();
    },
    [loadShifts],
  );

  /** Who the GM has cleared to cover the other group (a rec aid on golf ops). */
  const setStaffFlex = useCallback(
    async (staffId: string, flex: boolean) => {
      await directRpc("save_pro_shop_staff", {
        p_staff_id: staffId,
        p_values: { flex },
        p_reason: flex
          ? "Cleared to cover the other group"
          : "No longer cleared to cover the other group",
      }, "proshop.staff.flex");
      await loadStatic();
    },
    [loadStatic],
  );

  const saveCoverageRule = useCallback(
    async (rule: Pick<CoverageRule, "weekday" | "group"> & Partial<CoverageRule>) => {
      await directRpc("save_pro_shop_coverage_rule", {
        p_values: {
          area,
          weekday: rule.weekday,
          group: rule.group,
          open_time: rule.open_time,
          close_time: rule.close_time,
          base_staff: rule.base_staff,
          extra_staff: rule.extra_staff,
          extra_start: rule.extra_start ?? null,
        },
      }, "proshop.coverage.rule.save");
      await loadRules();
    },
    [area, loadRules],
  );

  const saveScheduleSettings = useCallback(
    async (next: Partial<Omit<ScheduleSettings, "area">>) => {
      await directRpc("save_pro_shop_schedule_settings", {
        p_values: { area, ...next },
      }, "proshop.coverage.settings.save");
      await loadRules();
    },
    [area, loadRules],
  );

  // ── Coverage-warning dismissals (per issue, per day) ──────────────────────
  /** Toggle a warning code as dismissed/restored for a given date. */
  const setWarningDismissed = useCallback(
    async (date: string, code: WarningCode, dismissed: boolean) => {
      const sched = schedules.find((s) => s.month === monthKey) ?? null;
      if (!sched) return;
      const current = sched.dismissed_warnings ?? {};
      const forDay = new Set(current[date] ?? []);
      if (dismissed) forDay.add(code);
      else forDay.delete(code);
      const nextForDay = Array.from(forDay);
      const next = { ...current };
      if (nextForDay.length) next[date] = nextForDay;
      else delete next[date];
      // Optimistic local update so the ⚠ and count react immediately.
      setSchedules((prev) =>
        prev.map((s) => (s.id === sched.id ? { ...s, dismissed_warnings: next } : s)),
      );
      try {
        await directRpc(
          "save_pro_shop_schedule",
          {
            p_schedule_id: sched.id,
            p_values: { dismissed_warnings: next },
            p_reason: dismissed ? `Coverage warning ${code} dismissed` : `Coverage warning ${code} restored`,
          },
          "proshop.schedule.dismiss",
        );
      } catch (e) {
        console.error("[pro-shop] dismiss warning failed:", e);
        await loadStatic();
      }
    },
    [schedules, monthKey, loadStatic],
  );

  const dismissWarning = useCallback(
    (date: string, code: WarningCode) => setWarningDismissed(date, code, true),
    [setWarningDismissed],
  );
  const restoreWarning = useCallback(
    (date: string, code: WarningCode) => setWarningDismissed(date, code, false),
    [setWarningDismissed],
  );

  // ── Time off ──────────────────────────────────────────────────────────────
  const addTimeOff = useCallback(
    async (staffId: string, startDate: string, endDate: string, reason: string) => {
      await directRpc(
        "save_pro_shop_time_off",
        {
          p_time_off_id: null,
          p_values: { staff_id: staffId, start_date: startDate, end_date: endDate, reason },
          p_reason: "Pro-shop time off added",
        },
        "proshop.timeoff.add",
      );
      await Promise.all([loadStatic(), loadShifts()]);
    },
    [loadStatic, loadShifts],
  );

  const removeTimeOff = useCallback(
    async (id: string) => {
      await directRpc("retire_pro_shop_time_off", {
        p_time_off_id: id,
        p_reason: "Pro-shop time-off entry removed from the active schedule",
      }, "proshop.timeoff.retire");
      await Promise.all([loadStatic(), loadShifts()]);
    },
    [loadStatic, loadShifts],
  );

  return {
    year,
    month0,
    setMonth: (y: number, m: number) => {
      setYear(y);
      setMonth0(m);
    },
    staff,
    staffById,
    schedule,
    schedules,
    shifts,
    timeOff,
    loading,
    error,
    reload,
    saveAvailability,
    addStaff,
    updateStaff,
    retireShiftsAfter,
    generateMonth,
    publishMonth,
    setScheduleNotes,
    addShift,
    updateShift,
    deleteShift,
    moveShift,
    setShiftLocked,
    setStaffFlex,
    rules,
    settings,
    unfilled,
    templates,
    saveWeekTemplate,
    deleteWeekTemplate,
    changeShift,
    removeSlotOnDay: rememberSlotRemoved,
    restampFrom,
    saveCoverageRule,
    saveScheduleSettings,
    addTimeOff,
    removeTimeOff,
    dismissWarning,
    restoreWarning,
    dayOverrides,
    setDayCounts,
    setDayLock,
    setDayUnstaffed,
    setManyDaysUnstaffed,
    resetDay,
    datesInMonth: () => datesInMonth(year, month0),
  };
}
