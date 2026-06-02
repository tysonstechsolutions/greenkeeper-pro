# Automatic Watering Schedule — Design

**Date:** 2026-06-01 · **Course:** Veterans Memorial GC, Great Lakes, IL (lat 42.31, cool-season)

## Problem

The course can only run **5 sprinklers at a time** (pump/pressure cap). The
superintendent wants an automatic, consistent overnight watering schedule for
all greens, tees, and fairways that respects that limit — buildable *now*,
independent of the still-in-progress sprinkler-head/satellite mapping.

## Decisions (from brainstorming)

- **Behavior:** auto-generate a staggered sequence, then allow manual tweaks
  with a ">5 concurrent" guardrail warning (never blocks).
- **Unit:** 54 hole-surface items (18 holes × green/tee/fairway), derived from
  the holes — *not* the existing per-zone or per-head tables. The existing
  `irrigation_sprinklers` head/satellite map stays untouched (additive only).
- **Cap:** 5 concurrent items (editable; it's a real pump setting).
- **Durations:** stored as **target depth (in) + precipitation rate (in/hr)
  per surface**, so run-minutes = `depth / rate × 60` and updating a measured
  rate auto-recomputes minutes.
- **Frequency:** per-surface days-of-week (deep & infrequent).

## Research-backed defaults (peak summer, finish ~5:30 AM)

| Surface | Target/cycle | Rate (assumed) | Run min | Frequency |
|---|---|---|---|---|
| Greens (bentgrass) | 0.15 in | 1.0 in/hr | ~9 | nightly (7×/wk) |
| Tees (blue/rye) | 0.20 in | 0.7 in/hr | ~17 | 4×/wk (Sun/Tue/Thu/Sat) |
| Fairways (blue/rye)| 0.40 in | 0.6 in/hr | ~40 | 3×/wk (Mon/Wed/Fri) |

Rationale: replace ~70–80% of peak July ET (~0.25 in/day) deep & infrequent;
finish near sunrise to cut evaporation + disease-driving leaf wetness. Rates
are *typical golf rotor* assumptions — verify with a catch-can test and update.

Sources: USGA BMPs for Irrigating Golf Course Turf (Rutgers); USGA ET-Based
Scheduling; Braun et al. 2022 (Crop Science); Powlen et al. 2023 (CFTM).

## Engine (pure functions — TDD)

`src/lib/utils/watering-schedule.ts`

1. `surfaceRunMinutes(depthIn, rateInHr)` → minutes (`round(depth/rate*60)`,
   guards rate ≤ 0 → 0).
2. `buildNightItems(config, weekday, overrides)` → `WateringItem[]` for one
   night: every hole-surface whose surface runs that weekday and isn't disabled,
   with its minutes (override or derived).
3. `generateSequence(items, cap, startMin)` → `ScheduledItem[]`
   `{item, lane, startOffset, endOffset}` + `makespan`. **LPT greedy**: sort by
   minutes desc, assign each to the lane that frees earliest.
4. `detectOverlaps(scheduled, cap)` → time ranges where > cap run (tweak
   guardrail).
5. `itemsRunningAt(scheduled, minuteOfDay)` → currently-watering items.

## Data

One migration `2026xxxx_watering_plans.sql`, single active row:

```
watering_plans(
  id, name, active,
  start_minute INT,            -- minutes-from-midnight the cycle begins
  finish_by_minute INT NULL,   -- warn if makespan runs past this
  concurrency_cap INT DEFAULT 5,
  greens_depth_in, greens_rate_inhr, greens_days INT[],
  tees_depth_in,   tees_rate_inhr,   tees_days INT[],
  fairways_depth_in, fairways_rate_inhr, fairways_days INT[],
  overrides JSONB DEFAULT '{}',  -- "{hole}-{surface}": {enabled?,minutes?,startOffset?}
  created_at, updated_at
)
```

RLS: authenticated read/manage (same as other irrigation tables). Hook
`useWateringPlan` loads/saves the single row via `directSelect/directPatch`.

## UI

`/irrigation/schedule` (tab on the irrigation page):
- **Setup:** per-surface depth + rate (shows derived minutes) + days; global
  start time, finish-by, cap; **Generate** button.
- **Timeline:** 5 lanes, blocks labeled `H7 Green · 9m · 9:00–9:09`; big
  "Done by 2:10 AM" readout, red if past finish-by.
- **Now running:** during the window, the ≤5 areas active this minute.
- **Tweak:** nudge a block's start; overlap guardrail flags >5; reset-to-auto.
- **Catch-can note:** inline helper to update the rate from a measured test.

## Testing

Five engine functions: full TDD red/green. Timeline + setup: component tests.
Gate: typecheck + lint + tests + build all green.
