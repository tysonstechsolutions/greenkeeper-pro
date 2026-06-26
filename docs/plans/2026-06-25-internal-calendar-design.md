# Internal Calendar — Design

_Date: 2026-06-25_

## Problem

The superintendent needs one internal calendar showing everything dated:
golf outings, food-&-beverage events, scheduled 1:1s, and general items
(appointments, meetings, deadlines). It must be easy to **add** items now, and
to **reschedule** (move) any item when a day gets busy. Future outing/F&B
request forms will write to the same tables so their entries appear
automatically.

## Decisions (confirmed with user)

- **Golf outings reuse the existing `tournaments` table** (event_type already
  includes `outing`). The calendar shows all golf events; no new golf table.
- **Scheduled 1:1s** are a new concept (planned meetings, reschedulable),
  distinct from the *logged* 1:1 records on the profile (which capture the
  discussion + concerns). New table.
- **Everything else** (F&B events, appointments, meetings, deadlines, other)
  lives in **one generic `calendar_events` table** with a `category`, so new
  kinds of dates never need a schema change. F&B is a category here (not its
  own table) with optional extra fields (guests, contact).
- **Reschedule = tap an item and change its date** (not drag-and-drop — more
  reliable on the Capacitor/mobile shell).
- Two new additive tables; applied to the live DB via the Management API.

## Data

**`calendar_events`** (generic):
`id`, `title`, `category` (`fb_event|appointment|meeting|deadline|other`),
`event_date`, `end_date?`, `start_time?`, `end_time?`, `all_day`, `location?`,
`expected_guests?`, `contact_name?`, `contact_phone?`, `status?`, `notes?`,
`created_by`, timestamps. Index on `event_date`.

**`staff_one_on_ones`** (scheduled 1:1s):
`id`, `employee_id` (FK profiles, cascade), `scheduled_on`, `scheduled_time?`,
`status` (`scheduled|completed|canceled`), `notes?`, `created_by`, timestamps.
Index on `scheduled_on`, `employee_id`.

Both: same permissive `for all to authenticated` RLS + `updated_at` trigger as
the other staff/app tables.

**`tournaments`** — unchanged; the calendar reads it for golf events.

## Data layer — `src/lib/calendar/`

- `types.ts`: `CalendarEvent`, `OneOnOneMeeting`, and a normalized
  `CalendarItem { source, sourceId, kind, title, date, endDate, time, color,
  href? }`.
- `use-calendar.ts`: loads tournaments + `staff_one_on_ones` + `calendar_events`,
  normalizes them to `CalendarItem[]`, and exposes:
  add/update/delete for calendar events; schedule/update/delete for 1:1s;
  add outing (insert a tournament, event_type `outing`); and
  `rescheduleItem(item, newDate)` that dispatches to the right table by source.
  Uses the direct-REST helpers (`src/lib/supabase/rest.ts`).

## UI

- **`/calendar`** (new page + sidebar entry "Calendar"): responsive **month
  grid** built with `date-fns` (no calendar lib). Color-coded chips —
  golf (green), 1:1 (blue), F&B (amber), neutral (appointment/meeting/
  deadline). Prev / next / Today. Multi-day items span their range.
- **Tap a day** → sheet listing that day's items (busy days / phones).
- **Tap an item** → detail sheet: open it (outing → `/tournaments/view`),
  **reschedule** (date input), and for a 1:1 mark done / cancel, for a
  calendar event edit / delete.
- **"+ Add"** → choose kind (Outing / 1:1 / F&B event / Appointment / Meeting /
  Deadline / Other) → the matching quick form.
- **"Upcoming"** list under the grid.
- **"Schedule next 1:1"** button on `/staff/profile` (creates a
  `staff_one_on_ones` row), so scheduling flows from the employee too.

## Edge cases / notes

- Calendar reads a generous date window (all rows for now — small data set;
  filter by month client-side). Revisit with a date filter if it grows.
- Logged 1:1 (discussion + concerns) stays on the profile; the calendar is the
  *schedule*. Marking a scheduled 1:1 "completed" is a status flip, not a log.

## Phases

1. Migration: `calendar_events` + `staff_one_on_ones` (apply live).
2. Types + `use-calendar` data layer.
3. `/calendar` month view + day sheet + upcoming.
4. "+ Add" (all kinds) + tap-to-reschedule + item detail.
5. Sidebar entry + profile "Schedule next 1:1".
6. Verify (tsc/lint/build + live round-trip) + commit.
