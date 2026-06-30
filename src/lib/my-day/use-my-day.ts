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

export interface UseMyDay {
  view: DayView<DailyStep>;
  loading: boolean;
  error: string | null;
  reload: () => void;
  toggleStep: (id: string, done: boolean) => Promise<void>;
  addQuickStep: (title: string, targetDate?: string | null) => Promise<void>;
  /** Smart entry: a capability task -> one tool-linked step; otherwise the AI
   *  breaks it into scheduled steps. */
  addSmart: (title: string, deadline?: string | null) => Promise<AddSmartResult>;
  addGoal: (input: {
    title: string;
    detail?: string;
    deadline?: string | null;
    bufferDays?: number;
  }) => Promise<AddGoalResult>;
  /** Bulk-add a parsed/imported list. No deadline -> backlog; deadline ->
   *  scheduled to (deadline - buffer). Returns how many were added. */
  bulkAdd: (items: { title: string; deadline?: string | null }[]) => Promise<number>;
  deleteStep: (id: string) => Promise<void>;
}

export function useMyDay(): UseMyDay {
  const { session } = useAuth();
  const ready = !!session?.access_token;

  const [steps, setSteps] = useState<DailyStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const today = todayLocal();

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    directSelectList<DailyStep>("daily_steps", {
      columns: "*",
      orderBy: [
        { column: "target_date", ascending: true, nullsFirst: false },
        { column: "sort_order", ascending: true },
      ],
      limit: 2000,
      label: "my-day.steps",
    })
      .then((rows) => {
        if (!cancelled) setSteps(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[my-day] load failed:", err);
        setError("Couldn't load your day.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, nonce]);

  const view = useMemo(() => partitionDayView(steps, today), [steps, today]);

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
    }): Promise<AddGoalResult> => {
      const uid = getCachedUserId();
      const bufferDays = input.bufferDays ?? DEFAULT_BUFFER_DAYS;
      const deadline = input.deadline ?? null;

      const [goal] = await directInsertRows<DailyGoal>(
        "daily_goals",
        [
          {
            title: input.title.trim(),
            detail: input.detail?.trim() || null,
            deadline,
            buffer_days: bufferDays,
            status: "active",
            created_by: uid,
          },
        ],
        "my-day.addGoal",
      );

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
    async (title: string, deadline: string | null = null): Promise<AddSmartResult> => {
      const clean = title.trim();
      if (!clean) return { capability: null, aiUsed: false, stepCount: 0 };

      // A task the app can already do -> one step linked to that tool, no
      // breakdown (the tool does the work).
      const cap = matchCapability(clean);
      if (cap && cap.available) {
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
      const r = await addGoal({ title: clean, deadline });
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
  };
}
