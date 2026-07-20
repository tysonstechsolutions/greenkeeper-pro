"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  directSelectAll,
  directRpc,
  directInsertRow,
  directPatchRow,
  getCachedUserId,
} from "@/lib/supabase/rest";
import type { CalendarEvent, OneOnOneMeeting, CalendarItem } from "./types";
import { isRecurring, recurrenceLabel, type RecurrenceFrequency } from "@/lib/my-day/recurrence";

interface TournamentRow {
  id: string;
  name: string;
  event_date: string;
  event_end_date: string | null;
  event_type: string;
  first_tee_time: string | null;
}

/** My Day goal (deadlined tasks show on the calendar on their due date). */
interface DailyGoalRow {
  id: string;
  title: string;
  deadline: string | null;
  status: string;
  recurrence: RecurrenceFrequency;
  recurrence_active: boolean;
}

interface DutyTaskRow {
  id: string;
  duty_id: string;
  title: string;
  due_date: string;
  original_due_date: string;
  status: string;
  duty_owner_type: "employee" | "contractor" | "unassigned" | null;
  duty_primary_name: string | null;
  duty_contractor_name: string | null;
}

export function useCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [meetings, setMeetings] = useState<OneOnOneMeeting[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [goals, setGoals] = useState<DailyGoalRow[]>([]);
  const [dutyTasks, setDutyTasks] = useState<DutyTaskRow[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [evs, mtgs, tourns, gls, profs, duties] = await Promise.all([
        directSelectAll<CalendarEvent>("calendar_events", {
          columns: "*",
          orderBy: [{ column: "event_date", ascending: true }, { column: "id" }],
          label: "calendar.events",
        }),
        directSelectAll<OneOnOneMeeting>("staff_one_on_ones", {
          columns: "*",
          orderBy: [{ column: "scheduled_on", ascending: true }, { column: "id" }],
          label: "calendar.oneonones",
        }),
        directSelectAll<TournamentRow>("tournaments", {
          columns: "id,name,event_date,event_end_date,event_type,first_tee_time",
          orderBy: [{ column: "event_date", ascending: true }, { column: "id" }],
          label: "calendar.tournaments",
        }),
        directSelectAll<DailyGoalRow>("daily_goals", {
          columns: "id,title,deadline,status,recurrence,recurrence_active",
          orderBy: [{ column: "deadline", ascending: true, nullsFirst: false }, { column: "id" }],
          label: "calendar.goals",
        }),
        directSelectAll<{ id: string; full_name: string }>("profiles", {
          columns: "id,full_name",
          orderBy: [{ column: "id" }],
          label: "calendar.profiles",
        }),
        directSelectAll<DutyTaskRow>("tasks", {
          columns: "id,duty_id,title,due_date,original_due_date,status,duty_owner_type,duty_primary_name,duty_contractor_name",
          filters: ["duty_id=not.is.null", "status=not.eq.cancelled"],
          orderBy: [{ column: "due_date" }, { column: "id" }],
          label: "calendar.dutyTasks",
        }),
      ]);
      setEvents(evs);
      setMeetings(mtgs);
      setTournaments(tourns);
      setGoals(gls);
      setDutyTasks(duties);
      const map: Record<string, string> = {};
      for (const p of profs) map[p.id] = p.full_name;
      setPeople(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the calendar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const items: CalendarItem[] = useMemo(() => {
    const out: CalendarItem[] = [];
    for (const t of tournaments) {
      out.push({
        source: "tournament",
        sourceId: t.id,
        kind: "golf",
        title: t.name,
        date: t.event_date,
        endDate: t.event_end_date,
        time: t.first_tee_time,
        href: `/tournaments/view?id=${t.id}`,
        subtitle: t.event_type && t.event_type !== "tournament" ? t.event_type : null,
      });
    }
    for (const m of meetings) {
      if (m.status === "canceled") continue;
      out.push({
        source: "one_on_one",
        sourceId: m.id,
        kind: "one_on_one",
        title: `1:1 — ${people[m.employee_id] || "Employee"}`,
        date: m.scheduled_on,
        endDate: null,
        time: m.scheduled_time,
        href: `/staff/profile?id=${m.employee_id}`,
        subtitle: m.status === "completed" ? "completed" : null,
      });
    }
    for (const e of events) {
      if (e.status === "canceled") continue;
      out.push({
        source: "calendar_event",
        sourceId: e.id,
        kind: e.category,
        title: e.title,
        date: e.event_date,
        endDate: e.end_date,
        time: e.all_day ? null : e.start_time,
        href: null,
        subtitle: e.location,
      });
    }
    // My Day tasks with a deadline — recurring ones flagged in the subtitle.
    for (const g of goals) {
      if (!g.deadline || g.status === "archived") continue;
      const repeats = isRecurring(g.recurrence) && g.recurrence_active;
      out.push({
        source: "daily_goal",
        sourceId: g.id,
        kind: "task",
        title: g.title,
        date: g.deadline,
        endDate: null,
        time: null,
        href: "/my-day",
        subtitle: repeats ? `Repeats ${recurrenceLabel(g.recurrence).toLowerCase()}` : "Task deadline",
        recurring: repeats,
      });
    }
    for (const task of dutyTasks) {
      const owner = task.duty_owner_type === "contractor"
        ? `Contractor: ${task.duty_contractor_name || "Not recorded"}`
        : task.duty_primary_name || "Unassigned";
      out.push({
        source: "duty_task",
        sourceId: task.id,
        dutyId: task.duty_id,
        kind: "task",
        title: task.title,
        date: task.due_date,
        endDate: null,
        time: null,
        href: `/tasks/view?id=${task.id}`,
        subtitle: `${owner} · ${task.status.replace("_", " ")}${task.original_due_date !== task.due_date ? ` · moved from ${task.original_due_date}` : ""}`,
      });
    }
    return out;
  }, [tournaments, meetings, events, goals, dutyTasks, people]);

  // ── calendar_events ──
  const addCalendarEvent = useCallback(
    async (payload: Partial<CalendarEvent>) => {
      await directRpc(
        "save_calendar_event",
        { p_event_id: null, p_values: payload, p_reason: "Calendar event created" },
        "calendar.events.add",
      );
      await load();
    },
    [load],
  );
  const updateCalendarEvent = useCallback(
    async (id: string, patch: Partial<CalendarEvent>) => {
      await directRpc("save_calendar_event", {
        p_event_id: id,
        p_values: patch,
        p_reason: "Calendar event updated",
      }, "calendar.events.update");
      await load();
    },
    [load],
  );
  const deleteCalendarEvent = useCallback(
    async (id: string) => {
      const reason = window.prompt("Why is this calendar event being canceled?")?.trim();
      if (!reason) return;
      await directRpc("cancel_calendar_event", {
        p_event_id: id,
        p_reason: reason,
      }, "calendar.events.cancel");
      await load();
    },
    [load],
  );

  // ── scheduled 1:1s ──
  const scheduleOneOnOne = useCallback(
    async (employeeId: string, scheduledOn: string, scheduledTime?: string | null, notes?: string | null) => {
      const supabasePayload = {
          employee_id: employeeId,
          scheduled_on: scheduledOn,
          scheduled_time: scheduledTime || null,
          notes: notes || null,
          status: "scheduled",
        };
      await directInsertRow("staff_one_on_ones", supabasePayload, "calendar.oneonone.add");
      await load();
    },
    [load],
  );
  const updateOneOnOne = useCallback(
    async (id: string, patch: Partial<OneOnOneMeeting>) => {
      await directPatchRow("staff_one_on_ones", "id", id, patch, "calendar.oneonone.update");
      await load();
    },
    [load],
  );
  const deleteOneOnOne = useCallback(
    async (id: string) => {
      await directPatchRow("staff_one_on_ones", "id", id, { status: "canceled" }, "calendar.oneonone.cancel");
      await load();
    },
    [load],
  );

  // ── golf outing (a tournament with event_type 'outing') ──
  const addOuting = useCallback(
    async (payload: {
      name: string;
      event_date: string;
      expected_players?: number | null;
      first_tee_time?: string | null;
      contact_name?: string | null;
      contact_phone?: string | null;
      notes?: string | null;
    }) => {
      const row: Record<string, unknown> = {
        name: payload.name,
        event_date: payload.event_date,
        event_type: "outing",
        status: "planning",
        created_by: getCachedUserId(),
      };
      if (payload.expected_players != null) row.expected_players = payload.expected_players;
      if (payload.first_tee_time) row.first_tee_time = payload.first_tee_time;
      if (payload.contact_name) row.contact_name = payload.contact_name;
      if (payload.contact_phone) row.contact_phone = payload.contact_phone;
      if (payload.notes) row.notes = payload.notes;
      await directInsertRow("tournaments", row, "calendar.outing.add");
      await load();
    },
    [load],
  );

  /**
   * Move any item to a new date — dispatches to its source table. For a
   * recurring task, `scope` decides whether the whole series follows: "series"
   * moves the canonical anchor too, "one" (default) leaves it so future
   * occurrences stay on the original schedule.
   */
  const rescheduleItem = useCallback(
    async (item: CalendarItem, newDate: string, scope: "one" | "series" = "one") => {
      if (item.source === "tournament") {
        await directPatchRow("tournaments", "id", item.sourceId, { event_date: newDate }, "calendar.reschedule.golf");
      } else if (item.source === "one_on_one") {
        await directPatchRow("staff_one_on_ones", "id", item.sourceId, { scheduled_on: newDate }, "calendar.reschedule.oneonone");
      } else if (item.source === "daily_goal") {
        const patch =
          item.recurring && scope === "series"
            ? { deadline: newDate, anchor_deadline: newDate }
            : { deadline: newDate };
        await directPatchRow("daily_goals", "id", item.sourceId, patch, "calendar.reschedule.goal");
      } else if (item.source === "duty_task") {
        const reason = window.prompt("Why is this occurrence moving?")?.trim();
        if (!reason) return;
        await directRpc("move_duty_occurrence", {
          p_task_id: item.sourceId,
          p_new_due_date: newDate,
          p_reason: reason,
        }, "calendar.reschedule.dutyOccurrence");
      } else {
        await directRpc("save_calendar_event", {
          p_event_id: item.sourceId,
          p_values: { event_date: newDate },
          p_reason: "Calendar event rescheduled",
        }, "calendar.reschedule.event");
      }
      await load();
    },
    [load],
  );

  const deleteItem = useCallback(
    async (item: CalendarItem) => {
      if (item.source === "one_on_one") await deleteOneOnOne(item.sourceId);
      else if (item.source === "calendar_event") await deleteCalendarEvent(item.sourceId);
      // tournaments are managed in the Tournaments section, not deleted here
    },
    [deleteOneOnOne, deleteCalendarEvent],
  );

  return {
    items,
    events,
    meetings,
    tournaments,
    people,
    loading,
    error,
    reload: load,
    addCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    scheduleOneOnOne,
    updateOneOnOne,
    deleteOneOnOne,
    addOuting,
    rescheduleItem,
    deleteItem,
  };
}
