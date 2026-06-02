/**
 * Watering-schedule engine.
 *
 * Pure functions that turn a per-surface watering config into a staggered
 * overnight run sequence that never exceeds the pump's concurrency cap (e.g.
 * "5 sprinklers at a time"). UI and persistence sit on top; this module has no
 * React or I/O so it can be tested exhaustively.
 *
 * Time is expressed in **minutes-from-window-start offsets**; the UI converts
 * offsets to wall-clock against the plan's start time.
 */

export type WateringSurface = "green" | "tee" | "fairway";

export interface SurfaceConfig {
  /** Target application depth per cycle, in inches. */
  depthIn: number;
  /** Sprinkler precipitation rate, in inches per hour. */
  rateInHr: number;
  /** Days of week this surface runs (0 = Sunday … 6 = Saturday). */
  days: number[];
}

export interface WateringItemOverride {
  enabled?: boolean;
  /** Explicit run minutes, replacing the derived value. */
  minutes?: number;
  /** Manual start offset (minutes from window start), replacing auto. */
  startOffset?: number;
}

export interface WateringPlanConfig {
  holeCount: number;
  concurrencyCap: number;
  /** Window start, minutes from midnight. */
  startMinute: number;
  /** Optional "must finish by", minutes from midnight (for the warning). */
  finishByMinute: number | null;
  greens: SurfaceConfig;
  tees: SurfaceConfig;
  fairways: SurfaceConfig;
  /** Sparse per-item overrides keyed by `"{hole}-{surface}"`. */
  overrides: Record<string, WateringItemOverride>;
}

export interface WateringItem {
  /** Stable id, `"{hole}-{surface}"`. */
  id: string;
  hole: number;
  surface: WateringSurface;
  minutes: number;
}

export interface ScheduledItem {
  item: WateringItem;
  /** Lane index (0 … cap-1). */
  lane: number;
  /** Minutes from window start. */
  startOffset: number;
  endOffset: number;
}

export interface OverlapRange {
  start: number;
  end: number;
  count: number;
}

/**
 * Run minutes to apply `depthIn` inches at a `rateInHr` precipitation rate.
 * Returns 0 for non-positive inputs (avoids divide-by-zero / negative time).
 */
export function surfaceRunMinutes(depthIn: number, rateInHr: number): number {
  if (depthIn <= 0 || rateInHr <= 0) return 0;
  return Math.round((depthIn / rateInHr) * 60);
}

const SURFACES: { key: WateringSurface; cfg: (c: WateringPlanConfig) => SurfaceConfig }[] = [
  { key: "green", cfg: (c) => c.greens },
  { key: "tee", cfg: (c) => c.tees },
  { key: "fairway", cfg: (c) => c.fairways },
];

/**
 * The hole-surface items that should run on a given weekday: every hole of
 * every surface scheduled for that day, excluding disabled items and any whose
 * run time works out to zero. Minutes come from the override or the derived
 * depth/rate value.
 */
export function buildNightItems(
  config: WateringPlanConfig,
  weekday: number,
): WateringItem[] {
  const items: WateringItem[] = [];

  for (const { key, cfg } of SURFACES) {
    const surface = cfg(config);
    if (!surface.days.includes(weekday)) continue;

    const derived = surfaceRunMinutes(surface.depthIn, surface.rateInHr);

    for (let hole = 1; hole <= config.holeCount; hole++) {
      const id = `${hole}-${key}`;
      const override = config.overrides[id];
      if (override?.enabled === false) continue;

      const minutes = override?.minutes ?? derived;
      if (minutes <= 0) continue;

      items.push({ id, hole, surface: key, minutes });
    }
  }

  return items;
}

/**
 * Packs items into `cap` lanes so at most `cap` run at once, minimizing total
 * finish time. Longest-Processing-Time greedy: sort by minutes descending,
 * assign each item to the lane that frees earliest.
 */
export function generateSequence(
  items: WateringItem[],
  cap: number,
  startMinute: number,
): { scheduled: ScheduledItem[]; makespan: number } {
  if (items.length === 0 || cap <= 0) {
    return { scheduled: [], makespan: 0 };
  }

  // Lane free-times, as offsets from the window start.
  const laneFree = new Array(cap).fill(0);

  // LPT: longest first. Stable tiebreak on id keeps output deterministic.
  const ordered = [...items].sort(
    (a, b) => b.minutes - a.minutes || a.id.localeCompare(b.id),
  );

  const scheduled: ScheduledItem[] = [];

  for (const item of ordered) {
    // Earliest-free lane.
    let lane = 0;
    for (let l = 1; l < cap; l++) {
      if (laneFree[l] < laneFree[lane]) lane = l;
    }
    const startOffset = laneFree[lane];
    const endOffset = startOffset + item.minutes;
    laneFree[lane] = endOffset;
    scheduled.push({
      item,
      lane,
      startOffset: startMinute + startOffset,
      endOffset: startMinute + endOffset,
    });
  }

  const makespan = Math.max(...laneFree);
  return { scheduled, makespan };
}

/**
 * Time ranges where more than `cap` items run simultaneously. Used by the
 * manual-tweak guardrail. Walks the start/end boundaries and records the spans
 * where the running count exceeds the cap.
 */
export function detectOverlaps(
  scheduled: ScheduledItem[],
  cap: number,
): OverlapRange[] {
  if (scheduled.length === 0) return [];

  // Boundary sweep: +1 at each start, -1 at each end.
  const points = new Set<number>();
  for (const s of scheduled) {
    points.add(s.startOffset);
    points.add(s.endOffset);
  }
  const sorted = [...points].sort((a, b) => a - b);

  const ranges: OverlapRange[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    // Count items active across [start, end).
    const count = scheduled.filter(
      (s) => s.startOffset <= start && end <= s.endOffset,
    ).length;
    if (count > cap) {
      const prev = ranges[ranges.length - 1];
      if (prev && prev.end === start && prev.count === count) {
        prev.end = end; // merge adjacent equal-count spans
      } else {
        ranges.push({ start, end, count });
      }
    }
  }

  return ranges;
}

/**
 * Items running at a given minute (half-open interval: start inclusive, end
 * exclusive). `minute` is in the same offset space as the scheduled items.
 */
export function itemsRunningAt(
  scheduled: ScheduledItem[],
  minute: number,
): ScheduledItem[] {
  return scheduled.filter(
    (s) => s.startOffset <= minute && minute < s.endOffset,
  );
}

/**
 * Whether the cycle (starting at `startMinute` minutes-from-midnight, lasting
 * `makespanMinutes`) finishes after the `finishByMinute` cutoff. Handles the
 * common overnight case where the cutoff is the next morning: if the cutoff is
 * at or before the start time, it's treated as belonging to the next day.
 */
export function runsPastFinishBy(
  startMinute: number,
  makespanMinutes: number,
  finishByMinute: number | null,
): boolean {
  if (finishByMinute === null) return false;
  const finishAbsolute = startMinute + makespanMinutes;
  const target =
    finishByMinute <= startMinute ? finishByMinute + 1440 : finishByMinute;
  return finishAbsolute > target;
}
