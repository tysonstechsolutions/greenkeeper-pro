# My Day — Recurring Tasks + Calendar Deadlines

**Date:** 2026-07-01
**Status:** Designed → implementing
**Surface:** My Day (`/my-day`), Calendar (`/calendar`)

## Problem

The "task list" the superintendent uses is **My Day**. Adding a task schedules a
`target_date`, and with no deadline (or after the AI splits it into steps) the
first item lands on **today** — so a task meant for "end of the month" looks like
it's due today. My Day has **no recurrence** at all. A separate hidden `/tasks`
page has a recurring-rule form, but nothing in the codebase ever generates the
next occurrence or tracks the cadence, so even there a "monthly" task is a single
one-off. Many real duties are weekly / monthly / quarterly / yearly and nothing
tracks whether this period's instance got done.

## Decisions (confirmed with user)

- Recurrence lives **inside My Day** (personal; no assignees/crews).
- Reuse the existing yesterday's model: AI splits the task into small steps spread
  from now until ~`buffer_days` (2) before the deadline — "done throughout the
  month, finished a few days early."
- When a task is created **with a deadline**, prompt: is it recurring, and how
  often — **Daily / Weekly / Monthly / Quarterly / Yearly** (default One-time).
- **Roll over automatically**: when a period's deadline passes, create the next
  occurrence for the current period and re-spread the same steps.
- Missed steps from a past period **stay visible as Overdue** (user can delete).
- **All** My Day tasks with a deadline appear on the **Calendar** on their due
  date; recurring ones are flagged.

## Data model

Additive columns on `daily_goals`:

| column              | type    | notes                                                        |
|---------------------|---------|--------------------------------------------------------------|
| `recurrence`        | text    | `none`\|`daily`\|`weekly`\|`monthly`\|`quarterly`\|`yearly`  |
| `recurrence_active` | boolean | default true; "Stop repeating" sets false                    |
| `series_id`         | uuid    | groups all occurrences of one recurring task                 |

- Unique index `(series_id, deadline)` where `series_id is not null` — a period
  can only be created once, so device races / reloads can't double-create.
- Partial index on active recurring goals.

No changes to `daily_steps`.

## Recurrence logic — `src/lib/my-day/recurrence.ts` (pure, tested)

- `advanceDeadline(deadline, freq)` — add one interval. Month/quarter/year use
  date-fns; **end-of-month is preserved** (Jul 31 → Aug 31 → Sep 30).
- `nextDeadline(lastDeadline, freq, today)` — advance repeatedly until the result
  is `>= today`, so a multi-period gap (app not opened for months) yields exactly
  **one** current occurrence, not a backfill of every missed period.
- `needsRollover(lastDeadline, today)` → `today > lastDeadline`.

## Rollover — in `use-my-day.ts`

On load, fetch goals **and** steps. For each active series, find the latest
occurrence (max deadline). If `needsRollover`, create the next goal (same
title/detail/buffer/recurrence/series_id) with `deadline = nextDeadline`, **copy
the previous occurrence's step titles** (ordered) and re-schedule them with the
existing `scheduleSteps` — no AI re-call, so each period is deterministic and
consistent. Skip if that `(series_id, deadline)` already exists in memory
(unique index is the backstop). Reload once if anything was created.

## UI — My Day page

- Add-form gains a **Repeat** select, enabled once a deadline is set.
- New **Recurring** section: each active series shows title, cadence, next due
  date, and status (On track / Overdue / Done) + **Stop repeating**.

## UI — Calendar

- `useCalendar` gains a 4th source: `daily_goals` with a non-null deadline →
  `CalendarItem { source: 'daily_goal', kind: 'task', href: '/my-day' }`,
  recurring flagged in the subtitle. New `task` kind meta + legend entry.
- Reschedule of a `daily_goal` patches `daily_goals.deadline`. Goals aren't
  deleted from the calendar (managed in My Day), same as tournaments.

## Out of scope (YAGNI)

- Custom intervals / biweekly / per-weekday recurrence.
- Assignees, crews, zones (that's the separate `/tasks` system).
- Series end-date field (the "Stop repeating" action covers it).

## Build order

1. Migration `20260701_my_day_recurrence.sql` (apply live via Management API).
2. `recurrence.ts` + tests (TDD).
3. Types (`DailyGoal`), then `use-my-day.ts` (load goals, recurrence params,
   rollover, stopRecurring, `recurringSeries`).
4. My Day page (Repeat control + Recurring section).
5. Calendar (`daily_goal` source + `task` kind + reschedule).
6. Verify: `vitest`, typecheck, build. Commit.
