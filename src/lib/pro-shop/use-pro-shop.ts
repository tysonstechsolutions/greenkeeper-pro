"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  directSelectList,
  directInsertRow,
  directInsertRows,
  directPatchRow,
  directDeleteRow,
  directDeleteByFilter,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type {
  ProShopSchedule,
  ProShopShift,
  ProShopStaff,
  ProShopTimeOff,
  ShiftGroup,
  WeeklyAvailability,
} from "./types";
import { datesInMonth, expandMonth, ymd } from "./schedule-engine";

/** Manual shift edit payload. */
export interface ShiftInput {
  staff_id: string;
  shift_date: string;
  group: ShiftGroup;
  start_time: string; // "HH:MM"
  end_time: string;
  note?: string | null;
  source?: "template" | "ai" | "manual";
}

function firstOfMonth(year: number, month0: number): string {
  return ymd(new Date(year, month0, 1));
}
function lastOfMonth(year: number, month0: number): string {
  return ymd(new Date(year, month0 + 1, 0));
}

export function useProShop(initialYear: number, initialMonth0: number) {
  const [year, setYear] = useState(initialYear);
  const [month0, setMonth0] = useState(initialMonth0);

  const [staff, setStaff] = useState<ProShopStaff[]>([]);
  const [schedules, setSchedules] = useState<ProShopSchedule[]>([]);
  const [shifts, setShifts] = useState<ProShopShift[]>([]);
  const [timeOff, setTimeOff] = useState<ProShopTimeOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatic = useCallback(async () => {
    const [st, sch, off] = await Promise.all([
      directSelectList<ProShopStaff>("pro_shop_staff", {
        columns: "*",
        orderBy: [{ column: "sort_order", ascending: true }],
        label: "proshop.staff",
      }),
      directSelectList<ProShopSchedule>("pro_shop_schedules", {
        columns: "*",
        orderBy: [{ column: "month", ascending: false }],
        label: "proshop.schedules",
      }),
      directSelectList<ProShopTimeOff>("pro_shop_time_off", {
        columns: "*",
        orderBy: [{ column: "start_date", ascending: true }],
        label: "proshop.timeoff",
      }),
    ]);
    setStaff(st);
    setSchedules(sch);
    setTimeOff(off);
  }, []);

  const loadShifts = useCallback(async () => {
    const first = firstOfMonth(year, month0);
    const last = lastOfMonth(year, month0);
    const rows = await directSelectList<ProShopShift>("pro_shop_shifts", {
      columns: "*",
      filters: [`shift_date=gte.${first}`, `shift_date=lte.${last}`],
      orderBy: [
        { column: "shift_date", ascending: true },
        { column: "start_time", ascending: true },
      ],
      label: "proshop.shifts",
    });
    setShifts(rows);
  }, [year, month0]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadStatic(), loadShifts()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the schedule.");
    } finally {
      setLoading(false);
    }
  }, [loadStatic, loadShifts]);

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

  // ── Availability ──────────────────────────────────────────────────────────
  const saveAvailability = useCallback(
    async (
      staffId: string,
      availability: WeeklyAvailability,
      availabilityText: string,
    ) => {
      await directPatchRow(
        "pro_shop_staff",
        "id",
        staffId,
        { availability, availability_text: availabilityText },
        "proshop.staff.availability",
      );
      await loadStatic();
    },
    [loadStatic],
  );

  const addStaff = useCallback(
    async (payload: {
      full_name: string;
      position: "rec_aid" | "golf_ops_assistant";
      default_group: ShiftGroup;
      flex?: boolean;
      phone?: string | null;
    }) => {
      const maxSort = staff.reduce((m, s) => Math.max(m, s.sort_order), 0);
      await directInsertRow(
        "pro_shop_staff",
        {
          full_name: payload.full_name,
          position: payload.position,
          default_group: payload.default_group,
          // Rec aids default to flex (cover any area); golf ops do not.
          flex: payload.flex ?? payload.position === "rec_aid",
          phone: payload.phone ?? null,
          sort_order: maxSort + 1,
          availability: { weekly: {}, notes: "" },
        },
        "proshop.staff.add",
      );
      await loadStatic();
    },
    [staff, loadStatic],
  );

  const updateStaff = useCallback(
    async (staffId: string, patch: Partial<ProShopStaff>) => {
      await directPatchRow("pro_shop_staff", "id", staffId, patch, "proshop.staff.update");
      await loadStatic();
    },
    [loadStatic],
  );

  // ── Month generation (deterministic) ──────────────────────────────────────
  /** Create/find the month's schedule, then stamp everyone's pattern into it. */
  const generateMonth = useCallback(
    async (replace: boolean): Promise<{ inserted: number }> => {
      let sched = schedules.find((s) => s.month === monthKey) ?? null;
      if (!sched) {
        const title = `${new Date(year, month0, 1).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })} Pro Shop Schedule`;
        sched = await directInsertRow<ProShopSchedule>(
          "pro_shop_schedules",
          { month: monthKey, title, status: "draft", created_by: getCachedUserId() },
          "proshop.schedule.create",
        );
      }
      if (replace) {
        await directDeleteByFilter(
          "pro_shop_shifts",
          [`schedule_id=eq.${sched.id}`],
          "proshop.shifts.clear",
        );
      }
      const planned = expandMonth(staff, year, month0, timeOff);
      const rows = planned.map((p) => ({
        schedule_id: sched!.id,
        staff_id: p.staff_id,
        shift_date: p.shift_date,
        group: p.group,
        start_time: p.start_time,
        end_time: p.end_time,
        source: p.source,
      }));
      if (rows.length) await directInsertRows("pro_shop_shifts", rows, "proshop.shifts.generate");
      await Promise.all([loadStatic(), loadShifts()]);
      return { inserted: rows.length };
    },
    [schedules, monthKey, year, month0, staff, timeOff, loadStatic, loadShifts],
  );

  const setScheduleNotes = useCallback(
    async (scheduleId: string, notes: string) => {
      await directPatchRow("pro_shop_schedules", "id", scheduleId, { notes }, "proshop.schedule.notes");
      await loadStatic();
    },
    [loadStatic],
  );

  /** Publish the month and drop a "rebuild next month" reminder on the calendar. */
  const publishMonth = useCallback(
    async (scheduleId: string) => {
      await directPatchRow(
        "pro_shop_schedules",
        "id",
        scheduleId,
        { status: "published" },
        "proshop.schedule.publish",
      );
      // Reminder to build the *next* month, dated ~5 days before this month ends.
      const next = new Date(year, month0 + 1, 1);
      const nextLabel = next.toLocaleDateString(undefined, { month: "long", year: "numeric" });
      const remindOn = ymd(new Date(year, month0 + 1, 0)); // last day of current month
      const remindDate = ymd(new Date(year, month0 + 1, 0 - 4)); // 5 days before end
      void remindOn;
      const title = `Update Pro Shop Schedule — ${nextLabel}`;
      // De-dupe: remove any existing reminder with this title first.
      const existing = await directSelectList<{ id: string }>("calendar_events", {
        columns: "id",
        filters: [`title=eq.${encodeURIComponent(title)}`],
        label: "proshop.reminder.find",
      });
      for (const e of existing) {
        await directDeleteRow("calendar_events", "id", e.id, "proshop.reminder.clear");
      }
      await directInsertRow(
        "calendar_events",
        {
          title,
          category: "deadline",
          event_date: remindDate,
          all_day: true,
          notes: `Build the ${nextLabel} pro shop schedule and publish it.`,
          created_by: getCachedUserId(),
        },
        "proshop.reminder.add",
      );
      await loadStatic();
    },
    [year, month0, loadStatic],
  );

  // ── Manual shift edits ────────────────────────────────────────────────────
  const addShift = useCallback(
    async (input: ShiftInput) => {
      const sched = schedules.find((s) => s.month === monthKey) ?? null;
      await directInsertRow(
        "pro_shop_shifts",
        {
          schedule_id: sched?.id ?? null,
          staff_id: input.staff_id,
          shift_date: input.shift_date,
          group: input.group,
          start_time: input.start_time,
          end_time: input.end_time,
          note: input.note ?? null,
          source: input.source ?? "manual",
        },
        "proshop.shift.add",
      );
      await loadShifts();
    },
    [schedules, monthKey, loadShifts],
  );

  const updateShift = useCallback(
    async (shiftId: string, patch: Partial<ProShopShift>) => {
      await directPatchRow("pro_shop_shifts", "id", shiftId, patch, "proshop.shift.update");
      await loadShifts();
    },
    [loadShifts],
  );

  const deleteShift = useCallback(
    async (shiftId: string) => {
      await directDeleteRow("pro_shop_shifts", "id", shiftId, "proshop.shift.delete");
      await loadShifts();
    },
    [loadShifts],
  );

  // ── Time off ──────────────────────────────────────────────────────────────
  const addTimeOff = useCallback(
    async (staffId: string, startDate: string, endDate: string, reason: string) => {
      await directInsertRow(
        "pro_shop_time_off",
        { staff_id: staffId, start_date: startDate, end_date: endDate, reason },
        "proshop.timeoff.add",
      );
      await Promise.all([loadStatic(), loadShifts()]);
    },
    [loadStatic, loadShifts],
  );

  const removeTimeOff = useCallback(
    async (id: string) => {
      await directDeleteRow("pro_shop_time_off", "id", id, "proshop.timeoff.delete");
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
    generateMonth,
    publishMonth,
    setScheduleNotes,
    addShift,
    updateShift,
    deleteShift,
    addTimeOff,
    removeTimeOff,
    datesInMonth: () => datesInMonth(year, month0),
  };
}
