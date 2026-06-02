"use client";

import { useCallback, useEffect, useState } from "react";
import {
  directSelectList,
  directPatchRow,
  directInsertRow,
} from "@/lib/supabase/rest";
import type {
  WateringPlanConfig,
  WateringItemOverride,
} from "@/lib/utils/watering-schedule";

/** Raw row shape from the `watering_plans` table (snake_case). */
export interface WateringPlanRow {
  id: string;
  name: string;
  active: boolean;
  hole_count: number;
  start_minute: number;
  finish_by_minute: number | null;
  concurrency_cap: number;
  greens_depth_in: number;
  greens_rate_in_hr: number;
  greens_days: number[];
  tees_depth_in: number;
  tees_rate_in_hr: number;
  tees_days: number[];
  fairways_depth_in: number;
  fairways_rate_in_hr: number;
  fairways_days: number[];
  overrides: Record<string, WateringItemOverride>;
  created_at: string;
  updated_at: string;
}

/** Plan as the UI/engine consume it: id + name + parsed config. */
export interface WateringPlan {
  id: string;
  name: string;
  active: boolean;
  config: WateringPlanConfig;
}

// PostgREST returns NUMERIC columns as strings; coerce defensively.
function num(v: unknown, fallback: number): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

/** Maps a DB row into the engine's camelCase config. Pure — unit-tested. */
export function rowToPlan(row: WateringPlanRow): WateringPlan {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    config: {
      holeCount: row.hole_count ?? 18,
      concurrencyCap: row.concurrency_cap ?? 5,
      startMinute: row.start_minute ?? 240, // 04:00 — early morning, not night
      finishByMinute: row.finish_by_minute ?? null,
      greens: {
        depthIn: num(row.greens_depth_in, 0.15),
        rateInHr: num(row.greens_rate_in_hr, 1.0),
        days: row.greens_days ?? [0, 1, 2, 3, 4, 5, 6],
      },
      tees: {
        depthIn: num(row.tees_depth_in, 0.2),
        rateInHr: num(row.tees_rate_in_hr, 0.7),
        days: row.tees_days ?? [0, 2, 4, 6],
      },
      fairways: {
        depthIn: num(row.fairways_depth_in, 0.4),
        rateInHr: num(row.fairways_rate_in_hr, 0.6),
        days: row.fairways_days ?? [1, 3, 5],
      },
      overrides: row.overrides ?? {},
    },
  };
}

/** Maps engine config back to DB columns for a PATCH. Pure — unit-tested. */
export function configToPatch(
  config: WateringPlanConfig,
): Record<string, unknown> {
  return {
    hole_count: config.holeCount,
    concurrency_cap: config.concurrencyCap,
    start_minute: config.startMinute,
    finish_by_minute: config.finishByMinute,
    greens_depth_in: config.greens.depthIn,
    greens_rate_in_hr: config.greens.rateInHr,
    greens_days: config.greens.days,
    tees_depth_in: config.tees.depthIn,
    tees_rate_in_hr: config.tees.rateInHr,
    tees_days: config.tees.days,
    fairways_depth_in: config.fairways.depthIn,
    fairways_rate_in_hr: config.fairways.rateInHr,
    fairways_days: config.fairways.days,
    overrides: config.overrides,
    updated_at: new Date().toISOString(),
  };
}

const COLUMNS =
  "id,name,active,hole_count,start_minute,finish_by_minute,concurrency_cap," +
  "greens_depth_in,greens_rate_in_hr,greens_days," +
  "tees_depth_in,tees_rate_in_hr,tees_days," +
  "fairways_depth_in,fairways_rate_in_hr,fairways_days,overrides,created_at,updated_at";

export interface UseWateringPlan {
  plan: WateringPlan | null;
  loading: boolean;
  error: string | null;
  /** Persist a new config for the loaded plan. */
  savePlan: (config: WateringPlanConfig) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useWateringPlan(): UseWateringPlan {
  const [plan, setPlan] = useState<WateringPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await directSelectList<WateringPlanRow>("watering_plans", {
        columns: COLUMNS,
        filters: ["active=eq.true"],
        orderBy: [{ column: "created_at", ascending: true }],
        limit: 1,
        label: "useWateringPlan.load",
      });

      if (rows.length > 0) {
        setPlan(rowToPlan(rows[0]));
      } else {
        // No plan yet (migration seed may not have run) — create one so the
        // screen always has something to edit.
        const created = await directInsertRow<WateringPlanRow>(
          "watering_plans",
          { name: "Summer schedule" },
          "useWateringPlan.create",
        );
        setPlan(rowToPlan(created));
      }
    } catch (err) {
      console.error("[useWateringPlan] load failed:", err);
      setError("Failed to load the watering plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const savePlan = useCallback(
    async (config: WateringPlanConfig): Promise<boolean> => {
      if (!plan) return false;
      try {
        await directPatchRow(
          "watering_plans",
          "id",
          plan.id,
          configToPatch(config),
          "useWateringPlan.save",
        );
        setPlan((prev) => (prev ? { ...prev, config } : prev));
        return true;
      } catch (err) {
        console.error("[useWateringPlan] save failed:", err);
        setError("Failed to save the watering plan.");
        return false;
      }
    },
    [plan],
  );

  return { plan, loading, error, savePlan, refresh: load };
}
