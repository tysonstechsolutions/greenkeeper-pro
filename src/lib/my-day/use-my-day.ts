"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  directSelectList,
  directInsertRows,
  directPatchRow,
  directDeleteRow,
  getCachedUserId,
} from "@/lib/supabase/rest";
import { addDaysLocal, todayLocal } from "@/lib/utils/date";
import { partitionDayView, scheduleSteps, type DayView } from "./schedule";
import { breakdownTask } from "./breakdown";
import { matchCapability, type Capability } from "./capabilities";
import {
  needsRollover,
  nextDeadline,
  isRecurring,
  type RecurrenceFrequency,
} from "./recurrence";
import type { DailyGoal, DailyStep } from "./types";

const DEFAULT_BUFFER_DAYS = 2;

export interface AddGoalResult {
  /** Whether the AI breakdown produced more than the single fallback step. */
  aiUsed: boolean;
  stepCount: number;
}

export interface AddSmartResult {
  /** Set when the task mapped to an app tool (added as one linked step). */
  capability: Capability | null;
  /** For non-capability tasks: whether the AI actually broke it down. */
  aiUsed: boolean;
  stepCount: number;
}

/** Health of a recurring task's current occurrence, for the Recurring section. */
export type SeriesStatus = "on_track" | "overdue" | "done";

export interface RecurringSeries {
  seriesId: string;
  goalId: string;
  title: string;
  recurrence: RecurrenceFrequency;
  /** The current occurrence's deadline (YYYY-MM-DD). */
  nextDue: string;
  status: SeriesStatus;
  stepsDone: number;
  stepsTotal: number;
}

export interface UseMyDay {
  view: DayView<DailyStep>;
  loading: boolean;
  error: string | null;
  reload: () => void;
  toggleStep: (id: string, done: boolean) => Promise<void>;
  addQuickStep: (title: string, targetDate?: string | null) => Promise<void>;
  /** Smart entry: a capability task -> one tool-linked step; otherwise the AI
   *  breaks it into scheduled steps. Pass a recurrence to make it repeat
   *  (requires a deadline to anchor the cadence). */
  addSmart: (
    title: string,
    deadline?: string | null,
    recurrence?: RecurrenceFrequency,
  ) => Promise<AddSmartResult>;
  addGoal: (input: {
    title: string;
    detail?: string;
    deadline?: string | null;
    bufferDays?: number;
    recurrence?: RecurrenceFrequency;
  }) => Promise<AddGoalResult>;
  /** Bulk-add a parsed/imported list. No deadline -> backlog; deadline ->
   *  scheduled to (deadline - buffer). Returns how many were added. */
  bulkAdd: (items: { title: string; deadline?: string | null }[]) => Promise<number>;
  deleteStep: (id: string) => Promise<void>;
  /** Active recurring tasks, one row per series, for the Recurring section. */
  recurringSeries: RecurringSeries[];
  /** Stop a recurring task from generating future occurrences. */
  stopRecurring: (seriesId: string) => Promise<void>;
}

/** Latest (max-deadline) occurrence per series id. */
function latestBySeries(goals: DailyGoal[]): Map<string, DailyGoal> {
  const latest = new Map<string, DailyGoal>();
  for (const g of goals) {
    if (!g.series_id || !g.deadline) continue;
    const cur = latest.get(g.series_id);
    if (!cur || (cur.deadline ?? "") < g.deadline) latest.set(g.series_id, g);
  }
  return latest;
}

export function useMyDay(): UseMyDay {
  const { session } = useAuth();
  const ready = !!session?.access_token;

  const [goals, setGoals] = useState<DailyGoal[]>([]);
  const [steps, setSteps] = useState<DailyStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const today = todayLocal();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    (async () => {
      try {
        const [goalRows, stepRows] = await Promise.all([
          directSelectList<DailyGoal>("daily_goals", {
            columns: "*",
            orderBy: [{ column: "deadline", ascending: true, nullsFirst: false }],
            limit: 2000,
            label: "my-day.goals",
          }),
          directSelectList<DailyStep>("daily_steps", {
            columns: "*",
            orderBy: [
              { column: "target_date", ascending: true, nullsFirst: false },
              { column: "sort_order", ascending: true },
            ],
            limit: 2000,
            label: "my-day.steps",
          }),
        ]);
        if (cancelled) return;

        // Materialize any recurring occurrences whose period has rolled over.
        const { newGoals, newSteps } = await rollForward(goalRows, stepRows, today);
        if (cancelled) return;

        setGoals([...goalRows, ...newGoals]);
        setSteps([...stepRows, ...newSteps]);
      } catch (err) {
        if (cancelled) return;
        console.error("[my-day] load failed:", err);
        setError("Couldn't load your day.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, nonce, today]);

  const view = useMemo(() => partitionDayView(steps, today), [steps, today]);

  const recurringSeries = useMemo<RecurringSeries[]>(() => {
    const latest = latestBySeries(
      goals.filter((g) => isRecurring(g.recurrence) && g.recurrence_active),
    );
    const stepsByGoal = new Map<string, DailyStep[]>();
    for (const s of steps) {
      if (!s.goal_id) continue;
      const arr = stepsByGoal.get(s.goal_id) ?? [];
      arr.push(s);
      stepsByGoal.set(s.goal_id, arr);
    }

    const out: RecurringSeries[] = [];
    for (const [seriesId, g] of latest) {
      const gs = stepsByGoal.get(g.id) ?? [];
      const total = gs.length;
      const done = gs.filter((s) => s.done).length;
      let status: SeriesStatus = "on_track";
      if (total > 0 && done === total) status = "done";
      else if (gs.some((s) => !s.done && s.target_date && s.target_date < today))
        status = "overdue";
      out.push({
        seriesId,
        goalId: g.id,
        title: g.title,
        recurrence: g.recurrence,
        nextDue: g.deadline ?? today,
        status,
        stepsDone: done,
        stepsTotal: total,
      });
    }
    return out.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
  }, [goals, steps, today]);

  const toggleStep = useCallback(async (id: string, done: boolean) => {
    const done_at = done ? new Date().toISOString() : null;
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, done, done_at } : s)),
    );
    try {
      await directPatchRow(
        "daily_steps",
        "id",
        id,
        { done, done_at, updated_at: new Date().toISOString() },
        "my-day.toggle",
      );
    } catch (err) {
      console.error("[my-day] toggle failed:", err);
      reload();
    }
  }, [reload]);

  const addQuickStep = useCallback(
    async (title: string, targetDate: string | null = today) => {
      const clean = title.trim();
      if (!clean) return;
      const rows = [
        {
          title: clean,
          target_date: targetDate,
          done: false,
          sort_order: 0,
          source: "manual",
          created_by: getCachedUserId(),
        },
      ];
      const inserted = await directInsertRows<DailyStep>(
        "daily_steps",
        rows,
        "my-day.addStep",
      );
      setSteps((prev) => [...prev, ...inserted]);
    },
    [today],
  );

  const addGoal = useCallback(
    async (input: {
      title: string;
      detail?: string;
      deadline?: string | null;
      bufferDays?: number;
      recurrence?: RecurrenceFrequency;
    }): Promise<AddGoalResult> => {
      const uid = getCachedUserId();
      const bufferDays = input.bufferDays ?? DEFAULT_BUFFER_DAYS;
      const deadline = input.deadline ?? null;
      // Recurrence needs a deadline to anchor the cadence; without one it's a
      // one-off no matter what was requested.
      const recurrence: RecurrenceFrequency =
        deadline && isRecurring(input.recurrence) ? input.recurrence! : "none";
      const seriesId = recurrence !== "none" ? crypto.randomUUID() : null;

      const [goal] = await directInsertRows<DailyGoal>(
        "daily_goals",
        [
          {
            title: input.title.trim(),
            detail: input.detail?.trim() || null,
            deadline,
            buffer_days: bufferDays,
            status: "active",
            recurrence,
            recurrence_active: true,
            series_id: seriesId,
            created_by: uid,
          },
        ],
        "my-day.addGoal",
      );
      setGoals((prev) => [...prev, goal]);

      // AI breakdown, with a graceful single-step fallback.
      let titles: string[] = [];
      try {
        titles = await breakdownTask({ title: input.title, detail: input.detail, deadline });
      } catch (err) {
        console.error("[my-day] breakdown failed:", err);
      }
      const aiUsed = titles.length > 0;
      if (!aiUsed) titles = [input.title.trim()];

      const scheduled = scheduleSteps(titles, { today, deadline, bufferDays });
      const rows = scheduled.map((s) => ({
        goal_id: goal.id,
        title: s.title,
        target_date: s.target_date,
        sort_order: s.sort_order,
        done: false,
        source: aiUsed ? "ai" : "manual",
        created_by: uid,
      }));
      const inserted = await directInsertRows<DailyStep>(
        "daily_steps",
        rows,
        "my-day.addGoalSteps",
      );
      setSteps((prev) => [...prev, ...inserted]);
      return { aiUsed, stepCount: inserted.length };
    },
    [today],
  );

  const addSmart = useCallback(
    async (
      title: string,
      deadline: string | null = null,
      recurrence: RecurrenceFrequency = "none",
    ): Promise<AddSmartResult> => {
      const clean = title.trim();
      if (!clean) return { capability: null, aiUsed: false, stepCount: 0 };

      // A task the app can already do -> one step linked to that tool, no
      // breakdown (the tool does the work). Only for non-recurring quick tasks;
      // a recurring task always becomes a tracked goal so it can roll over.
      const cap = matchCapability(clean);
      if (cap && cap.available && !isRecurring(recurrence)) {
        let target_date: string | null = today;
        if (deadline) {
          const buffered = addDaysLocal(deadline, -DEFAULT_BUFFER_DAYS);
          target_date = buffered < today ? today : buffered;
        }
        const inserted = await directInsertRows<DailyStep>(
          "daily_steps",
          [
            {
              title: clean,
              target_date,
              done: false,
              sort_order: 0,
              source: "capability",
              created_by: getCachedUserId(),
            },
          ],
          "my-day.addSmart.capability",
        );
        setSteps((prev) => [...prev, ...inserted]);
        return { capability: cap, aiUsed: false, stepCount: inserted.length };
      }

      // Otherwise break it into scheduled steps (AI, with single-step fallback).
      const r = await addGoal({ title: clean, deadline, recurrence });
      return { capability: null, aiUsed: r.aiUsed, stepCount: r.stepCount };
    },
    [today, addGoal],
  );

  const bulkAdd = useCallback(
    async (items: { title: string; deadline?: string | null }[]): Promise<number> => {
      const uid = getCachedUserId();
      const clean = items
        .map((it) => ({ title: it.title.trim(), deadline: it.deadline ?? null }))
        .filter((it) => it.title);
      if (clean.length === 0) return 0;

      const rows = clean.map((it, i) => {
        let target_date: string | null = null;
        if (it.deadline) {
          const buffered = addDaysLocal(it.deadline, -DEFAULT_BUFFER_DAYS);
          target_date = buffered < today ? today : buffered;
        }
        return {
          title: it.title,
          target_date,
          done: false,
          sort_order: i,
          source: "bulk",
          created_by: uid,
        };
      });
      const inserted = await directInsertRows<DailyStep>(
        "daily_steps",
        rows,
        "my-day.bulkAdd",
      );
      setSteps((prev) => [...prev, ...inserted]);
      return inserted.length;
    },
    [today],
  );

  const deleteStep = useCallback(async (id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
    try {
      await directDeleteRow("daily_steps", "id", id, "my-day.deleteStep");
    } catch (err) {
      console.error("[my-day] delete failed:", err);
      reload();
    }
  }, [reload]);

  const stopRecurring = useCallback(
    async (seriesId: string) => {
      const affected = goals.filter((g) => g.series_id === seriesId);
      setGoals((prev) =>
        prev.map((g) =>
          g.series_id === seriesId ? { ...g, recurrence_active: false } : g,
        ),
      );
      try {
        await Promise.all(
          affected.map((g) =>
            directPatchRow(
              "daily_goals",
              "id",
              g.id,
              { recurrence_active: false, updated_at: new Date().toISOString() },
              "my-day.stopRecurring",
            ),
          ),
        );
      } catch (err) {
        console.error("[my-day] stopRecurring failed:", err);
        reload();
      }
    },
    [goals, reload],
  );

  return {
    view,
    loading,
    error,
    reload,
    toggleStep,
    addQuickStep,
    addSmart,
    addGoal,
    bulkAdd,
    deleteStep,
    recurringSeries,
    stopRecurring,
  };
}

/**
 * Create the next occurrence for any active recurring series whose current
 * period has ended. Copies the previous occurrence's step titles (no AI re-call)
 * and re-spreads them across the new window. Skips a period that already exists
 * in memory; the (series_id, deadline) unique index is the DB backstop.
 */
async function rollForward(
  goals: DailyGoal[],
  steps: DailyStep[],
  today: string,
): Promise<{ newGoals: DailyGoal[]; newSteps: DailyStep[] }> {
  const active = goals.filter((g) => isRecurring(g.recurrence) && g.recurrence_active);
  const latest = latestBySeries(active);

  const existing = new Set(
    goals
      .filter((g) => g.series_id && g.deadline)
      .map((g) => `${g.series_id}|${g.deadline}`),
  );

  const stepsByGoal = new Map<string, DailyStep[]>();
  for (const s of steps) {
    if (!s.goal_id) continue;
    const arr = stepsByGoal.get(s.goal_id) ?? [];
    arr.push(s);
    stepsByGoal.set(s.goal_id, arr);
  }

  const newGoals: DailyGoal[] = [];
  const newSteps: DailyStep[] = [];

  for (const [, g] of latest) {
    if (!g.deadline || !g.series_id) continue;
    if (!needsRollover(g.deadline, today)) continue;

    const dl = nextDeadline(g.deadline, g.recurrence, today);
    if (existing.has(`${g.series_id}|${dl}`)) continue;

    try {
      const [goal] = await directInsertRows<DailyGoal>(
        "daily_goals",
        [
          {
            title: g.title,
            detail: g.detail,
            deadline: dl,
            buffer_days: g.buffer_days,
            status: "active",
            recurrence: g.recurrence,
            recurrence_active: true,
            series_id: g.series_id,
            created_by: g.created_by ?? getCachedUserId(),
          },
        ],
        "my-day.rollover.goal",
      );

      const prevSteps = (stepsByGoal.get(g.id) ?? []).sort(
        (a, b) => a.sort_order - b.sort_order,
      );
      let titles = prevSteps.map((s) => s.title).filter(Boolean);
      if (titles.length === 0) titles = [g.title];

      const scheduled = scheduleSteps(titles, {
        today,
        deadline: dl,
        bufferDays: g.buffer_days,
      });
      const rows = scheduled.map((s) => ({
        goal_id: goal.id,
        title: s.title,
        target_date: s.target_date,
        sort_order: s.sort_order,
        done: false,
        source: "recurring",
        created_by: g.created_by ?? getCachedUserId(),
      }));
      const inserted = await directInsertRows<DailyStep>(
        "daily_steps",
        rows,
        "my-day.rollover.steps",
      );

      newGoals.push(goal);
      newSteps.push(...inserted);
      existing.add(`${g.series_id}|${dl}`);
    } catch (err) {
      // A racing device may have created this period first (unique index) — fine.
      console.error("[my-day] rollover failed for series", g.series_id, err);
    }
  }

  return { newGoals, newSteps };
}
