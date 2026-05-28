# Sprinkler Map v2 — Issues, Station Inventory, PDF Report

Date: 2026-05-28
Status: Design approved, ready for implementation
Builds on: [2026-05-28-sprinkler-map-design.md](./2026-05-28-sprinkler-map-design.md)

## Three additions

1. **Per-sprinkler issue tracking with history** — mark a sprinkler as
   low-pressure / one-side-only / no-spray / broken / etc., with severity,
   description, reported & resolved dates. Multiple issues over time.
2. **Per-station inventory** — record stations that exist on a satellite but
   don't control any sprinkler (intentionally unused, or known-broken).
   Surfaces as a grid in the By Satellite view: green = has heads, gray =
   unused, red = broken, white = unknown.
3. **Printable PDF report** — multi-section PDF: open issues, full inventory
   by satellite, station inventory grids.

## Data model

Two new tables. The existing `irrigation_sprinklers` table is unchanged.

```sql
-- Station-level status for stations that don't have any sprinklers.
-- Stations with sprinklers don't need a row here — their status is derived.
create table irrigation_satellite_stations (
  id            uuid primary key default gen_random_uuid(),
  satellite_num int  not null,
  station_num   int  not null,
  status        text not null check (status in ('unused','broken','note_only')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (satellite_num, station_num)
);

-- Full issue history per sprinkler.
create table irrigation_sprinkler_issues (
  id               uuid primary key default gen_random_uuid(),
  sprinkler_id     uuid not null
                       references irrigation_sprinklers(id) on delete cascade,
  issue_type       text not null check (issue_type in (
                       'low_pressure','one_side_only','no_spray','broken',
                       'leaking','clogged','stuck_on','stuck_off','other')),
  severity         text not null default 'medium'
                       check (severity in ('low','medium','high')),
  description      text,
  status           text not null default 'open'
                       check (status in ('open','resolved')),
  reported_at      timestamptz not null default now(),
  resolved_at      timestamptz,
  resolution_notes text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```

**Indexes** — by sprinkler_id (for fast per-sprinkler lookups), by status
(for filtering open issues), by `(satellite_num, station_num)` for inventory.

**RLS** — same `authenticated USING (true)` pattern as the rest of the
irrigation tables.

**Derived "current status"** of a sprinkler (not stored on the sprinkler row,
computed on read):

- If any open issues → status = the type of the highest-severity open issue
- Else → status = `ok`

**Derived "last serviced"**: the latest `resolved_at` across the sprinkler's
issues. Null if none.

These derivations happen client-side at render time. Volumes are small enough
(hundreds of sprinklers × handful of issues) that this is cheap.

## UI changes — Map view

### Pin rendering

- Sprinkler with **no open issues**: existing solid colored dot, station number inside.
- Sprinkler with **open issue(s)**: same dot + a small red ring around it, and a
  tiny red exclamation badge in the upper-right corner of the pin.

### Edit dialog gains "Status & Issues" section

Below the existing fields:

```
─── Status & Issues ─────────────────────────────────
Current status: ⚠ Low Pressure (high severity)
                or ✓ OK
Last serviced:  Apr 14, 2026 (or "never")

Open issues (1)
  ⚠ Low Pressure · high · "spraying weak since last week"
    Reported May 24, 2026 by Tyson    [Mark resolved]

Past issues (3)                        [▾ show history]

[+ Report new issue]
```

The "Report new issue" form (mini, inline):
- Issue type (select)
- Severity (radio: low/med/high)
- Description (textarea, optional)
- [Cancel] [Save issue]

Saving a new issue creates a row in `irrigation_sprinkler_issues` with
status=open, reported_at=now. "Mark resolved" sets status=resolved,
resolved_at=now, optional resolution_notes.

### List row indicator

Sprinkler rows in the list, By Satellite tables, and search results gain a
small status pill: `✓ OK` (green) / `⚠ Issue` (amber) / `⛔ Broken` (red).

## UI changes — By Satellite view: Station Inventory

For each satellite, in addition to the existing station list, add a
**Station Inventory** grid above it:

```
Satellite 3 — 14 stations · 21 heads · [3 issues]
─────────────────────────────────────────────────
Station Inventory (1–48)
 1 ■  2 ■  3 ■  4 □  5 ■  6 ⌧  7 ■  8 ■  9 ■  10 ■
11 ■ 12 ⚠ 13 ■ 14 ■ 15 ■ 16 □ 17 ■ 18 ■ 19 □ 20 □
21 □ 22 □ 23 □ 24 □ ...
            ───────────────────────
            ■ has heads   □ unknown   ⌧ unused (no head)
            ⚠ has open issue   ✗ broken station
```

- **Default range**: 1 to max(station_num seen across all sprinklers + station-notes), rounded up to nearest 12 (typical Rainbird block sizes). Configurable via a number input on the satellite card.
- **Click any cell**:
  - If has sprinklers → expand station's rows below (existing behavior)
  - If empty → opens a small dialog: "Set station 6 on satellite 3 to: [Unused] [Broken] [Just a note]" + notes field

### Header button

A new "Download Report" button in the page header → triggers PDF generation
client-side.

## PDF Report layout

Generated client-side via jsPDF + jspdf-autotable, matching the existing
`observation-report.ts` brand palette (BRAND_DARK, BRAND_GREEN, BRAND_GOLD).

**Pages:**

1. **Cover** — title, generated date, course name (VMGC), summary stats:
   - Total sprinklers mapped: 247
   - Open issues: 8 (3 high, 4 medium, 1 low)
   - Sprinklers in service: 239 / 247 (97%)
   - Last service: distribution (last 30 days / 30-90 / 90+)

2. **Open issues** — sorted by severity desc then by hole asc:
   - One row per open issue
   - Columns: Sat/Sta · Hole · Area · Issue type · Severity · Reported · Description

3. **Full sprinkler inventory** — grouped by satellite:
   - One section per satellite
   - Table: Station # · Hole · Area · Label · Current status · Last serviced
   - Highlight rows with open issues

4. **Station inventory grids** — one per satellite:
   - Grid of stations with status colors
   - Legend at bottom

Filename: `VMGC-sprinkler-report-YYYY-MM-DD.pdf`

## Implementation phases

1. **Migration** — `20260528_add_sprinkler_issues_and_stations.sql`
2. **Types** — extend the page's interfaces for issues + station notes
3. **Load** — fetch issues and station notes alongside sprinklers
4. **Status derivation** — helper that computes current_status + last_serviced for a sprinkler
5. **Pin rendering** — red ring + exclamation badge on issued pins
6. **Issue UI in edit dialog** — current status, open issues list, history, "Report new issue" form, "Mark resolved" button
7. **Station Inventory grid** — render in By Satellite view; click handlers for set-status dialog
8. **Set-station-status dialog** — for empty stations
9. **PDF report** — `src/lib/reports/sprinkler-report.ts` following observation-report.ts patterns
10. **Header button** — Download Report
11. **Verification** — end-to-end in browser preview

## Out of scope for this round

- Scheduled service reminders / next-service-due dates
- Photo attachments on issues
- Assigning issues to staff members
- Equipment/work-order integration
- Spray pattern diagrams
- Cost tracking per repair
