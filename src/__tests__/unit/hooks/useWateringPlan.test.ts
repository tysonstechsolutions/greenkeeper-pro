/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  rowToPlan,
  configToPatch,
  type WateringPlanRow,
} from "@/lib/hooks/useWateringPlan";

const row = (over: Partial<WateringPlanRow> = {}): WateringPlanRow => ({
  id: "p1",
  name: "Summer schedule",
  active: true,
  hole_count: 18,
  start_minute: 1260,
  finish_by_minute: 360,
  concurrency_cap: 5,
  greens_depth_in: 0.15,
  greens_rate_in_hr: 1.0,
  greens_days: [0, 1, 2, 3, 4, 5, 6],
  tees_depth_in: 0.2,
  tees_rate_in_hr: 0.7,
  tees_days: [0, 2, 4, 6],
  fairways_depth_in: 0.4,
  fairways_rate_in_hr: 0.6,
  fairways_days: [1, 3, 5],
  overrides: {},
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  ...over,
});

describe("rowToPlan", () => {
  it("maps snake_case columns into the engine's camelCase config", () => {
    const plan = rowToPlan(row());
    expect(plan.id).toBe("p1");
    expect(plan.config.concurrencyCap).toBe(5);
    expect(plan.config.startMinute).toBe(1260);
    expect(plan.config.finishByMinute).toBe(360);
    expect(plan.config.greens.depthIn).toBe(0.15);
    expect(plan.config.fairways.days).toEqual([1, 3, 5]);
  });

  it("coerces PostgREST NUMERIC strings into numbers", () => {
    // PostgREST serializes NUMERIC as strings — must not stay strings.
    // Use values that DIFFER from the column fallbacks, so a broken coercion
    // (which would fall back) is actually distinguishable from a real parse.
    const plan = rowToPlan(
      row({
        greens_depth_in: "0.33" as unknown as number,
        greens_rate_in_hr: "0.85" as unknown as number,
      }),
    );
    expect(plan.config.greens.depthIn).toBe(0.33);
    expect(plan.config.greens.rateInHr).toBe(0.85);
    expect(typeof plan.config.greens.depthIn).toBe("number");
  });

  it("keeps a null finish_by_minute as null", () => {
    const plan = rowToPlan(row({ finish_by_minute: null }));
    expect(plan.config.finishByMinute).toBeNull();
  });

  it("preserves overrides", () => {
    const plan = rowToPlan(row({ overrides: { "7-green": { minutes: 22 } } }));
    expect(plan.config.overrides["7-green"]).toEqual({ minutes: 22 });
  });
});

describe("configToPatch", () => {
  it("maps the engine config back to DB columns", () => {
    const plan = rowToPlan(row());
    const patch = configToPatch(plan.config);
    expect(patch.concurrency_cap).toBe(5);
    expect(patch.greens_depth_in).toBe(0.15);
    expect(patch.tees_days).toEqual([0, 2, 4, 6]);
    expect(patch.overrides).toEqual({});
    expect(patch).toHaveProperty("updated_at");
  });

  it("round-trips config → patch → config without drift", () => {
    const original = rowToPlan(row()).config;
    const patch = configToPatch(original) as unknown as Partial<WateringPlanRow>;
    const reloaded = rowToPlan(row(patch)).config;
    expect(reloaded.greens).toEqual(original.greens);
    expect(reloaded.tees).toEqual(original.tees);
    expect(reloaded.fairways).toEqual(original.fairways);
    expect(reloaded.startMinute).toBe(original.startMinute);
  });
});
