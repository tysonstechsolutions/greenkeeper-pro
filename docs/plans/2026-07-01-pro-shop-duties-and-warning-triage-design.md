# Pro Shop — Recurring Role Duties + Schedule Warning Triage

**Date:** 2026-07-01
**Status:** Designed → implementing
**Surface:** Pro Shop scheduler (`/pro-shop-schedule` + new `/pro-shop-schedule/duties`)

Two related additions to the Pro Shop area.

---

## Feature A — Recurring role duties

Give the pro-shop jobs standing daily duties (rec aids vacuum a few days a week,
put the graduation table up Wednesday / down Thursday, etc.).

**Decisions (confirmed):**
- Lives on a **separate, printable page** linked from the schedule — NOT stamped
  onto the schedule (would blow up the print page count).
- A duty attaches to **either** an **area** (Outside/rec aids, Inside/golf ops,
  or Both) **or** a **specific person** — user wants the option to do either.
- Recurs **by weekday** (pick days; "Daily" = all 7).
- **Posted reference list only** — no checkboxes / completion tracking.

**Data — new table `pro_shop_duties`:**
| column      | type    | notes                                              |
|-------------|---------|----------------------------------------------------|
| title       | text    | the duty                                           |
| area        | text    | `outside`\|`inside`\|`both` — set iff not a person |
| staff_id    | uuid    | → pro_shop_staff — set iff not an area             |
| days        | jsonb   | weekday keys, e.g. `["mon","wed","fri"]`           |
| note        | text    | optional (e.g. "before opening")                   |
| is_active   | boolean | default true                                       |
| sort_order  | int     | default 0                                          |

CHECK: exactly one of (area, staff_id) is non-null. RLS all-authenticated, like
the other `pro_shop_*` tables.

**Pure helper `src/lib/pro-shop/duties.ts` (tested):** `dutyDayFlags` (7 bools),
`summarizeDutyDays` ("Mon · Wed · Fri" / "Daily"), `groupDuties(duties, staff)`
→ ordered sections: Rec Aids (Outside), Golf Ops (Inside), Both areas, then one
section per person with personal duties.

**Hook `use-pro-shop-duties.ts`:** loads active `pro_shop_staff` + `pro_shop_duties`,
`addDuty` / `updateDuty` / `deleteDuty`.

**Page `/pro-shop-schedule/duties`:** header (back, Print, Add duty); a printable
`ref` region rendering the grouped sections, each duty as a `S M T W T F S` strip
+ note; add/edit bottom-sheet (title, assign area|person, weekday toggles + Daily,
note). Print via existing `printElement()`. Linked by a **Duties** button in the
schedule header.

---

## Feature B — Schedule warning triage

Today: generating a month flags days with a red ⚠ and a top "N days need
attention" count, but never says WHAT, can't be acted on, and can't be dismissed.

**Structured warnings:** refactor `dayWarnings()` to return
`DayWarning[] = { code, message }` — codes `no_outside`, `no_inside`,
`no_inside_opener`, `no_inside_closer`, `no_outside_closer`; messages are plain
English with the fix implied.

**See + fix:** the day editor gains a **Needs attention** panel above the existing
Add-shift / Day-off-cover actions (fix in place). The top count becomes a
**button** → an **Attention overlay** listing each flagged day + its issues; tap a
day to open its editor.

**Bypass / clear:** each issue has **Dismiss**; dismissed issues stop counting,
drop the ⚠, and can be un-dismissed. Persisted per issue-per-day in a new
additive `dismissed_warnings jsonb` column on `pro_shop_schedules`
(`{ "2026-06-13": ["no_inside_closer"] }`). Per-issue (not whole-day) so a new,
different problem still surfaces. The count + ⚠ reflect only live (non-dismissed)
issues.

**Hook:** `useProShop` exposes `schedule.dismissed_warnings`, `dismissWarning`,
`restoreWarning`; `activeWarnings(date, allWarnings)` filters out dismissed.

---

## Migrations (additive, applied live via Management API)
- `20260701_pro_shop_duties.sql` — new `pro_shop_duties` table.
- `20260701_pro_shop_warning_dismissals.sql` — `dismissed_warnings` column.

## Out of scope (YAGNI)
- Duty completion tracking / checkoffs (posted list only).
- One-off single-date duties (use a note / the schedule).
- A duty assigned to several named people at once (use an area, or add twice).
