/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  surfaceRunMinutes,
  buildNightItems,
  generateSequence,
  detectOverlaps,
  itemsRunningAt,
  runsPastFinishBy,
  type WateringPlanConfig,
  type WateringItem,
  type ScheduledItem,
} from "@/lib/utils/watering-schedule";

// ── surfaceRunMinutes ──────────────────────────────────────────────────────

describe("surfaceRunMinutes", () => {
  it("computes minutes from depth and precip rate", () => {
    // 0.20 in / 0.7 in/hr * 60 = 17.14 -> 17
    expect(surfaceRunMinutes(0.2, 0.7)).toBe(17);
  });

  it("rounds to the nearest whole minute", () => {
    // 0.15 / 1.0 * 60 = 9
    expect(surfaceRunMinutes(0.15, 1.0)).toBe(9);
    // 0.40 / 0.6 * 60 = 40
    expect(surfaceRunMinutes(0.4, 0.6)).toBe(40);
  });

  it("returns 0 for a non-positive rate (avoids divide-by-zero)", () => {
    expect(surfaceRunMinutes(0.2, 0)).toBe(0);
    expect(surfaceRunMinutes(0.2, -1)).toBe(0);
  });

  it("returns 0 for a non-positive depth", () => {
    expect(surfaceRunMinutes(0, 1)).toBe(0);
  });
});

// ── buildNightItems ────────────────────────────────────────────────────────

const baseConfig: WateringPlanConfig = {
  holeCount: 18,
  concurrencyCap: 5,
  startMinute: 21 * 60,
  finishByMinute: 6 * 60,
  greens: { depthIn: 0.15, rateInHr: 1.0, days: [0, 1, 2, 3, 4, 5, 6] },
  tees: { depthIn: 0.2, rateInHr: 0.7, days: [0, 2, 4, 6] },
  fairways: { depthIn: 0.4, rateInHr: 0.6, days: [1, 3, 5] },
  overrides: {},
};

describe("buildNightItems", () => {
  it("includes only surfaces scheduled for the given weekday", () => {
    // Monday = 1: greens (every day) + fairways ([1,3,5]); tees NOT ([0,2,4,6])
    const items = buildNightItems(baseConfig, 1);
    const surfaces = new Set(items.map((i) => i.surface));
    expect(surfaces.has("green")).toBe(true);
    expect(surfaces.has("fairway")).toBe(true);
    expect(surfaces.has("tee")).toBe(false);
  });

  it("creates one item per hole for each active surface", () => {
    // Sunday = 0: greens (everyday) + tees ([0,2,4,6]); fairways NOT
    const items = buildNightItems(baseConfig, 0);
    const greens = items.filter((i) => i.surface === "green");
    const tees = items.filter((i) => i.surface === "tee");
    expect(greens).toHaveLength(18);
    expect(tees).toHaveLength(18);
    expect(items.filter((i) => i.surface === "fairway")).toHaveLength(0);
  });

  it("derives minutes from each surface's depth and rate", () => {
    const items = buildNightItems(baseConfig, 1);
    const green = items.find((i) => i.surface === "green")!;
    const fairway = items.find((i) => i.surface === "fairway")!;
    expect(green.minutes).toBe(9);
    expect(fairway.minutes).toBe(40);
  });

  it("honors a per-item duration override", () => {
    const cfg = { ...baseConfig, overrides: { "7-green": { minutes: 22 } } };
    const items = buildNightItems(cfg, 1);
    const h7 = items.find((i) => i.hole === 7 && i.surface === "green")!;
    expect(h7.minutes).toBe(22);
  });

  it("excludes an item disabled via overrides", () => {
    const cfg = { ...baseConfig, overrides: { "12-green": { enabled: false } } };
    const items = buildNightItems(cfg, 1);
    expect(items.some((i) => i.hole === 12 && i.surface === "green")).toBe(false);
  });

  it("drops items whose derived minutes are zero", () => {
    const cfg: WateringPlanConfig = {
      ...baseConfig,
      greens: { depthIn: 0, rateInHr: 1, days: [0, 1, 2, 3, 4, 5, 6] },
    };
    const items = buildNightItems(cfg, 1);
    expect(items.some((i) => i.surface === "green")).toBe(false);
  });
});

// ── generateSequence ───────────────────────────────────────────────────────

const mkItem = (id: string, minutes: number): WateringItem => ({
  id,
  hole: 1,
  surface: "green",
  minutes,
});

describe("generateSequence", () => {
  it("never runs more than the cap concurrently", () => {
    const items = Array.from({ length: 12 }, (_, i) => mkItem(`i${i}`, 10));
    const { scheduled } = generateSequence(items, 5, 0);
    // Check every minute of the schedule.
    const end = Math.max(...scheduled.map((s) => s.endOffset));
    for (let m = 0; m < end; m++) {
      const running = scheduled.filter((s) => s.startOffset <= m && m < s.endOffset);
      expect(running.length).toBeLessThanOrEqual(5);
    }
  });

  it("starts the first cap items at the window start with no delay", () => {
    const items = Array.from({ length: 5 }, (_, i) => mkItem(`i${i}`, 10));
    const { scheduled } = generateSequence(items, 5, 1260); // 21:00
    expect(scheduled.every((s) => s.startOffset === 1260)).toBe(true);
  });

  it("packs the 6th item after the earliest lane frees up", () => {
    const items = Array.from({ length: 6 }, (_, i) => mkItem(`i${i}`, 10));
    const { scheduled } = generateSequence(items, 5, 0);
    const sixth = scheduled.find((s) => s.item.id === "i5")!;
    // First 5 fill the lanes 0..10; the 6th starts when one frees at 10.
    expect(sixth.startOffset).toBe(10);
  });

  it("reports the makespan (finish offset of the whole cycle)", () => {
    const items = Array.from({ length: 6 }, (_, i) => mkItem(`i${i}`, 10));
    const { makespan } = generateSequence(items, 5, 0);
    // 6 items of 10 min across 5 lanes -> 20 min makespan.
    expect(makespan).toBe(20);
  });

  it("assigns longest jobs first for a tight pack (LPT)", () => {
    const items = [mkItem("long", 30), mkItem("a", 10), mkItem("b", 10)];
    // cap 2: 'long' in lane 0, a+b stacked in lane 1 -> makespan 30, not 40.
    const { makespan } = generateSequence(items, 2, 0);
    expect(makespan).toBe(30);
  });

  it("returns empty for no items", () => {
    const { scheduled, makespan } = generateSequence([], 5, 0);
    expect(scheduled).toEqual([]);
    expect(makespan).toBe(0);
  });
});

// ── detectOverlaps ─────────────────────────────────────────────────────────

const sched = (id: string, start: number, end: number): ScheduledItem => ({
  item: { id, hole: 1, surface: "green", minutes: end - start },
  lane: 0,
  startOffset: start,
  endOffset: end,
});

describe("detectOverlaps", () => {
  it("returns nothing when concurrency stays within the cap", () => {
    const s = [sched("a", 0, 10), sched("b", 10, 20)];
    expect(detectOverlaps(s, 1)).toEqual([]);
  });

  it("flags a window where more than the cap run at once", () => {
    const s = [sched("a", 0, 10), sched("b", 5, 15), sched("c", 5, 8)];
    // From minute 5..8, three run -> exceeds cap of 2.
    const overlaps = detectOverlaps(s, 2);
    expect(overlaps.length).toBeGreaterThan(0);
    expect(overlaps[0].start).toBe(5);
    expect(overlaps[0].end).toBe(8);
  });
});

// ── itemsRunningAt ─────────────────────────────────────────────────────────

describe("itemsRunningAt", () => {
  it("returns the items active at a given minute", () => {
    const s = [sched("a", 600, 610), sched("b", 605, 620), sched("c", 700, 710)];
    const running = itemsRunningAt(s, 607);
    expect(running.map((r) => r.item.id).sort()).toEqual(["a", "b"]);
  });

  it("treats the end minute as not running (half-open interval)", () => {
    const s = [sched("a", 600, 610)];
    expect(itemsRunningAt(s, 610)).toEqual([]);
    expect(itemsRunningAt(s, 609)).toHaveLength(1);
  });
});

// ── runsPastFinishBy ───────────────────────────────────────────────────────

describe("runsPastFinishBy", () => {
  it("is false when there is no finish-by limit", () => {
    expect(runsPastFinishBy(1260, 600, null)).toBe(false);
  });

  it("handles an overnight window finishing before the morning cutoff", () => {
    // Start 21:00 (1260), 3h run -> finishes 24:00. Cutoff 06:00 next day.
    expect(runsPastFinishBy(1260, 180, 360)).toBe(false);
  });

  it("flags an overnight window that runs past the morning cutoff", () => {
    // Start 21:00, 10h run -> finishes 07:00 next day, past the 06:00 cutoff.
    expect(runsPastFinishBy(1260, 600, 360)).toBe(true);
  });

  it("handles a same-day window where the cutoff is later that day", () => {
    // Start 05:00 (300), 1h run -> 06:00; cutoff 07:00 same day -> fine.
    expect(runsPastFinishBy(300, 60, 420)).toBe(false);
    // 3h run -> 08:00, past the 07:00 cutoff.
    expect(runsPastFinishBy(300, 180, 420)).toBe(true);
  });
});
