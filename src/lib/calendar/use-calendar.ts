"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  directSelectList,
  directInsertRow,
  directPatchRow,
  directDeleteRow,
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

export function useCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [meetings, setMeetings] = useState<OneOnOneMeeting[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [goals, setGoals] = useState<DailyGoalRow[]>([]);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [evs, mtgs, tourns, gls, profs] = await Promise.all([
        directSelectList<CalendarEvent>("calendar_events", {
          columns: "*",
          orderBy: [{ column: "event_date", ascending: true }],
          label: "calendar.events",
        }),
        directSelectList<OneOnOneMeeting>("staff_one_on_ones", {
          columns: "*",
          orderBy: [{ column: "scheduled_on", ascending: true }],
          label: "calendar.oneonones",
        }),
        directSelectList<TournamentRow>("tournaments", {
          columns: "id,name,event_date,event_end_date,event_type,first_tee_time",
          orderBy: [{ column: "event_date", ascending: true }],
          label: "calendar.tournaments",
        }),
        directSelectList<DailyGoalRow>("daily_goals", {
          columns: "id,title,deadline,status,recurrence,recurrence_active",
          orderBy: [{ column: "deadline", ascending: true, nullsFirst: false }],
          label: "calendar.goals",
        }),
        directSelectList<{ id: string; full_name: string }>("profiles", {
          columns: "id,full_name",
          label: "calendar.profiles",
        }),
      ]);
      setEvents(evs);
      setMeetings(mtgs);
      setTournaments(tourns);
      setGoals(gls);
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
      });
    }
    return out;
  }, [tournaments, meetings, events, goals, people]);

  // ── calendar_events ──
  const addCalendarEvent = useCallback(
    async (payload: Partial<CalendarEvent>) => {
      await directInsertRow(
        "calendar_events",
        { ...payload, created_by: getCachedUserId() },
        "calendar.events.add",
      );
      await load();
    },
    [load],
  );
  const updateCalendarEvent = useCallback(
    async (id: string, patch: Partial<CalendarEvent>) => {
      await directPatchRow("calendar_events", "id", id, patch, "calendar.events.update");
      await load();
    },
    [load],
  );
  const deleteCalendarEvent = useCallback(
    async (id: string) => {
      await directDeleteRow("calendar_events", "id", id, "calendar.events.delete");
      await load();
    },
    [load],
  );

  // ── scheduled 1:1s ──
  const scheduleOneOnOne = useCallback(
    async (employeeId: string, scheduledOn: string, scheduledTime?: string | null, notes?: string | null) => {
      await directInsertRow(
        "staff_one_on_ones",
        {
          employee_id: employeeId,
          scheduled_on: scheduledOn,
          scheduled_time: scheduledTime || null,
          notes: notes || null,
          status: "scheduled",
          created_by: getCachedUserId(),
        },
        "calendar.oneonone.add",
      );
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
      await directDeleteRow("staff_one_on_ones", "id", id, "calendar.oneonone.delete");
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

  /** Move any item to a new date — dispatches to its source table. */
  const rescheduleItem = useCallback(
    async (item: CalendarItem, newDate: string) => {
      if (item.source === "tournament") {
        await directPatchRow("tournaments", "id", item.sourceId, { event_date: newDate }, "calendar.reschedule.golf");
      } else if (item.source === "one_on_one") {
        await directPatchRow("staff_one_on_ones", "id", item.sourceId, { scheduled_on: newDate }, "calendar.reschedule.oneonone");
      } else if (item.source === "daily_goal") {
        await directPatchRow("daily_goals", "id", item.sourceId, { deadline: newDate }, "calendar.reschedule.goal");
      } else {
        await directPatchRow("calendar_events", "id", item.sourceId, { event_date: newDate }, "calendar.reschedule.event");
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
