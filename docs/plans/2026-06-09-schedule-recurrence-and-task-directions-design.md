# Crew Schedule: Seasonal Recurrence, Faster Delete, New Duties & AI Directions

**Date:** 2026-06-09
**Status:** Designed (validated with user), ready for implementation plan

## Overview

Five connected improvements to the crew schedule board:

1. **Frequency drives recurrence.** Dropping a template on the board repeats it
   automatically based on its frequency tier, bounded by the golf season.
2. **Fast delete.** Remove a task straight from its chip; series-aware prompts.
3. **New duty templates.** Trash, sticks, pitch marks, tee-box repair.
4. **New categories.** Real "Grounds" and "Tees" categories.
5. **AI "Generate Directions."** On add-task, Claude writes start-to-finish
   directions grounded in the course's verified-present equipment.

## Key decisions (from brainstorming)

| Question | Decision |
|---|---|
| Daily repeat | Repeats on the **weekday you drop it on**, every week. Place on each day you want covered. |
| Weekly repeat | Same as daily — repeats on the dropped weekday, every week. |
| Monthly repeat | **Same weekday-slot** each month (drop on 2nd Tuesday → every 2nd Tuesday). |
| One-off bucket | Keep **Seasonal** AND add **Projects** — both one-off (no repeat). |
| Repeat horizon | **Seasonal**: generate through **Nov 1**, skip off-season, resume **Apr 1** next year, indefinitely. |
| Storage | **Materialize real task rows** (not virtual rules) so morning route / reports / completion all work. |
| Delete | ✕ on chip; repeating → "Just this day" vs "This + all future (stops series)". |
| New categories | Add real `grounds` and `tees`. |
| AI equipment | Ground strictly in `fy26_assets.status = 'verified_present'`; auto-fill task's Equipment Needed. |
| AI scope | Add-task / project flow only for now (not template editor). |

**Season window:** Apr 1 → Nov 1 each year. Starts as a code constant
(`src/lib/utils/season.ts`); can move to `app_settings` later.

## Tiers → behavior

| Tier | On drop |
|---|---|
| Daily | Series; repeats dropped weekday weekly, within season. |
| Weekly | Series; identical mechanics to Daily (place on one day). |
| Monthly | Series; nth-weekday-of-month, within season. |
| Seasonal | One-off; only the placed day. No series. |
| Projects | One-off; only the placed day. No series. |

## Data model

### 1. `task_templates.frequency` (new column)
- `TEXT NOT NULL DEFAULT 'weekly' CHECK (frequency IN ('daily','weekly','monthly','seasonal','projects'))`.
- Backfill existing rows by running the current name-heuristic
  (`classifyTemplateFrequency`) once in the migration so nothing changes
  visually.
- Replaces name-guessing as the source of truth. The backlog chip and the
  classifier read this column first (keep the heuristic only as the default
  for brand-new templates before a value is chosen).

### 2. New categories `grounds`, `tees`
- Extend the `category` CHECK constraint on **`task_templates`** and **`tasks`**
  to include `'grounds'` and `'tees'` (drop + recreate the constraint; first
  detect the live constraint's current value set so nothing is lost — prod may
  already include `events`/`pro_shop`/`customer_service`).
- Add to `TaskCategory` in `src/types/database.ts`.
- Add labels + display order everywhere categories render:
  `board-backlog.tsx`, `board-task-editor.tsx`, `board-new-task-sheet.tsx`,
  `/tasks/new`, `/tasks/edit`, and any report category maps.

### 3. `task_series` (new table)
Remembers a repeating job so the nightly job can extend it and delete can stop it.

```
id              uuid pk
assigned_to     uuid  -> profiles (the crew member)
template_id     uuid  -> task_templates (nullable, ON DELETE SET NULL)
tier            text  check in ('daily','weekly','monthly')
weekday         int   (0=Sun..6=Sat) -- for daily/weekly + monthly slot
week_of_month   int   (1..5)  -- monthly only (nth occurrence)
task_payload    jsonb -- snapshot of title/description/category/priority/
                      --   estimated_minutes/equipment_needed/checklist/
                      --   requires_photo_*/weather_*/notes
active          boolean default true
created_by      uuid  -> profiles
created_at      timestamptz default now()
```

### 4. `tasks.series_id` (new column)
- `uuid REFERENCES task_series(id) ON DELETE SET NULL`.
- Partial unique index `(series_id, due_date) WHERE series_id IS NOT NULL` to
  make generation idempotent (no duplicate occurrence for the same day).

## Recurrence generation

### Shared date logic — `src/lib/utils/season.ts` (+ mirrored in the edge fn)
- `SEASON_START = {month:4, day:1}`, `SEASON_END = {month:11, day:1}`.
- `inSeason(date)`, `clampToSeason`, `weeklyOccurrences(anchor, horizon)`,
  `monthlyOccurrences(weekday, weekOfMonth, fromDate, horizon)`.
- All occurrence dates filtered to `inSeason`.

### On drop (client, `useScheduleBoard`)
- Template tier `seasonal`/`projects` (or a one-off quick-add) → today's single
  task only (existing `createTaskFromTemplate` path).
- Tier `daily`/`weekly`/`monthly`:
  1. Insert a `task_series` row (snapshot payload + schedule fields).
  2. Compute occurrence dates from the dropped date through **Nov 1 of that
     season** (if dropped off-season, start the upcoming Apr 1; show a small
     "starts Apr 1" note).
  3. Batch-insert one `tasks` row per date, each with `series_id`.
  4. Optimistic: show the dropped-day chip immediately; refresh fills the rest.

### Nightly top-up (`pg_cron` → edge fn `extend-recurring-tasks`)
- Reuse the existing `pg_cron` pattern (see `20260417c_add_pg_cron_daily_briefing`).
- For each `active` series, ensure occurrences exist from today through the end
  of the **current or upcoming season** (rolling ~1 season ahead). This makes
  the Apr-1 resume automatic, year over year, with bounded row growth.
- Idempotent via the partial unique index; insert only missing dates.

### Off-season
- Nothing generates Nov 2 – Mar 31. One-off Seasonal/Projects tasks can still be
  placed any day (e.g. winterization).

## Delete / edit on the board

- **✕ on each task chip** (hover desktop / long-press mobile) → quick remove.
  Inspector keeps "Remove from schedule."
- **No `series_id`** → delete immediately.
- **Has `series_id`** → small prompt:
  - *Just this day* → delete that one row.
  - *This + all future* → delete `series_id = X AND due_date >= thisDate AND
    status = 'pending'`, then set `series.active = false` (cron won't refill).
  - Completed/past occurrences are never deleted.
- **Safety:** if the task is `in_progress`/`completed` or has photos/sign-off,
  confirm before deleting.

## New duty templates (seed migration)

| Template | Tier | Category | Checklist |
|---|---|---|---|
| Pick Up Trash | daily | grounds | Empty bins tee-to-green · pick up litter · replace liners |
| Pick Up Sticks / Debris | daily | grounds | Walk holes · clear sticks/limbs · haul off |
| Fix Pitch Marks on Greens | daily | greens | Repair ball marks on every green · level surface |
| Repair Tee Boxes | weekly | tees | Fill divots with mix · level · seed if needed |

- Added the same way as the mow consolidation (guarded, idempotent inserts),
  each with its explicit `frequency`.

## AI "Generate Directions"

### Edge function `task-directions` (mirror of `green-fix-instructions`)
- **POST** `{ title, description?, category?, location? }`; requires signed-in user.
- Query `fy26_assets WHERE status = 'verified_present'` → list of
  `description` + `manufacturer` + `model_text`.
- Course-framed prompt (respects the in-persona constraint so it won't refuse):
  the task + location + "here is the equipment we actually have on hand — use
  only these by name; if something essential is missing, say so explicitly so
  the super can rent/buy it." Ask for numbered start-to-finish steps **and** a
  JSON list of which provided assets were used.
- Return `{ directions: string, equipment_used: string[] }`.
- Model: match existing functions (`claude-sonnet-4-*`), `max_tokens` ~1500,
  30s timeout, graceful error (button errors, manual entry still works).

### Client wiring
- Board quick-add sheet + `/tasks/new`: Description → multi-line **Directions**
  box with a **"✨ Generate with AI"** button.
- On success: fill Directions; set the task's `equipment_needed` to
  `equipment_used` (matched back to the asset list).
- Directions save with the task and show in the task detail for the crew.

## Surfaces touched

- **DB migrations:** `task_templates.frequency`; category CHECK (+grounds/tees)
  on `task_templates` & `tasks`; `task_series` table; `tasks.series_id` + index;
  new-duty template seeds; `pg_cron` schedule.
- **Edge functions:** `task-directions` (new), `extend-recurring-tasks` (new).
- **App:** `season.ts`; `useScheduleBoard` (series create + occurrence gen +
  series-aware delete); `template-frequency.ts` (read explicit column);
  board chips/cells (✕ delete, series badge); `board-new-task-sheet` &
  `/tasks/new` (Directions + AI button + new categories); category label/order
  maps; `database.ts` types.

## Testing

- Unit: `season.ts` occurrence math (weekly across season boundary; nth-weekday
  monthly; off-season clamp; leap/边 month-end).
- Unit: delete-series selection (future-only, skips completed).
- Integration: drop daily template → rows land on the right weekdays only,
  within season; idempotent re-run inserts nothing.
- Edge fn: `task-directions` returns steps that only name verified-present
  assets; flags gaps; graceful failure with no key.
- Manual: board drag → preview verification per the preview workflow.

## Rollout

- Independent & already written: `20260609_consolidate_mow_templates.sql`
  (mow cleanup) — apply via `db push` or SQL Editor.
- This feature ships as additional dated migrations + two edge-function deploys
  (`supabase functions deploy task-directions extend-recurring-tasks`) + the
  `pg_cron` schedule. Build on a branch; verify typecheck/build/tests before
  applying anything to production.
