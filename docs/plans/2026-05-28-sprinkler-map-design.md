# Sprinkler Map — Design

Date: 2026-05-28
Status: Design approved, ready for implementation

## Problem

The superintendent needs to map every Rainbird **satellite + station number** to
the physical sprinkler heads it controls, for greens, tee boxes, and fairways.
Today this knowledge only lives in his head. The course has 13+ satellites and
roughly 400–800 heads. One station number can fire multiple heads.

Three lookup directions matter equally:

1. Sprinkler → which satellite/station fires it (broken head in the field)
2. Satellite/station → which heads it fires (standing at the satellite box)
3. Hole/area → all controls covering that area (planning work on a hole)

## Approach

A new sub-page at **`/irrigation/map`**, reached from a "Sprinkler Map" button
in the existing `/irrigation` page header. Layered on top of the existing
hole-image renders in `public/holes/hole-N-landscape.png`.

Entry is **tap-on-map**: the user picks a hole, taps the image where a
sprinkler sits, fills a short form (satellite #, station #, area, optional
label), saves. Pin appears immediately. This works equally well on phone (in
the field, walking satellite to satellite) and desktop (at the shop, from
memory).

No separate satellites table — satellite number is just an int on each
sprinkler row. Can be added later if metadata per satellite becomes useful.

## Data model

One new table:

```sql
create table public.irrigation_sprinklers (
  id            uuid primary key default gen_random_uuid(),
  satellite_num int  not null,
  station_num   int  not null,
  hole_number   int  not null check (hole_number between 1 and 18),
  area_type     text not null check (area_type in ('green','tee','fairway')),
  x_pct         numeric(5,4) not null check (x_pct >= 0 and x_pct <= 1),
  y_pct         numeric(5,4) not null check (y_pct >= 0 and y_pct <= 1),
  label         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on public.irrigation_sprinklers (hole_number);
create index on public.irrigation_sprinklers (satellite_num, station_num);
```

`(satellite_num, station_num)` is intentionally **not** unique — multiple heads
on one station is a valid and common case.

RLS: follow the same pattern as `irrigation_zones` (authenticated users can
read/write within their org).

## UI

### Layout — `/irrigation/map`

```
┌─ Sprinkler Map ────────────────  [ Hole 5 ▾ ]  [ View ▾ ]┐
│                                                            │
│   [ aerial of selected hole with pins overlaid ]           │
│                                                            │
│  Legend:  ● green  ● tee  ● fairway       [Filter satN]    │
└────────────────────────────────────────────────────────────┘

Below the map (collapsible):
  Sprinklers on this hole
  ─────────────────────────────────────────
   ● Green   front     Sat 4 / Sta 16   …
   ● Green   left      Sat 4 / Sta 14   …
   ● Tee     back      Sat 3 / Sta 2    …
      ...
```

### Interactions

- **Add**: tap empty area on map → form modal (satellite, station, area, label,
  notes) → save → pin appears.
- **Edit**: tap existing pin → same form, prefilled, with Delete button.
- **Filter**: chips at top to show/hide by area or by satellite number.
- **Hole selector**: dropdown 1–18 swaps the underlying image.
- **View modes** (single page, three tabs):
  - **Map** (default) — the visual one above
  - **By Satellite** — list every distinct satellite, expand to see all
    stations and their heads
  - **By Sprinkler** — searchable table across all rows; filter by anything

### Pin rendering

- 18px circle, colored by area (green / lime / blue)
- White halo for contrast against the hole image
- Station number printed inside
- Tooltip on hover/long-press: `Sat 3 / Sta 12 — front-left`

### Mobile considerations

- Tap target ≥ 32px effective (pin renders at 18px but hit area is bigger)
- Pinch-zoom on image for precise pin placement
- Form modal is full-screen on phone, dialog on desktop
- Save defaults the next "Add" to the same satellite and area, so adding 6
  heads on the same green is fast (only the station # changes between them)

## Lookup screens detail

### "By Satellite" view

```
┌─ All satellites ─────────────────────────────────────┐
│  ▸ Sat 1       12 stations, 18 heads                 │
│  ▸ Sat 2        8 stations, 14 heads                 │
│  ▾ Sat 3       18 stations, 31 heads                 │
│      Station   Area      Hole  Label        Heads    │
│      ─────────────────────────────────────────────   │
│        1       Tee        5    —              2 →    │
│        2       Tee        5    back           1 →    │
│        5       Fairway    5    —              2 →    │
│          ...                                         │
│  ▸ Sat 4       ...                                   │
└──────────────────────────────────────────────────────┘
```

Tap a station row → opens **Map view** zoomed to that hole, with the matching
pin(s) pulsing for 2 seconds.

### "By Sprinkler" view

Search box at top, results table below. Search hits any of: hole #, area,
label, satellite #, station #. Empty search shows all sorted by hole then area.

## Implementation phases

1. **DB migration** — create `irrigation_sprinklers` table + RLS policies
2. **API layer** — extend `lib/supabase/rest.ts` calls (already used by
   `/irrigation`) — CRUD for sprinklers
3. **Page scaffold** — new route `/irrigation/map`, hole selector, image
   display, empty-state
4. **Pin rendering + add flow** — click-to-add modal, save, render pin
5. **Edit/delete flow** — tap-pin-to-edit, delete confirmation
6. **List view below map** — collapsible table of pins on current hole
7. **"By Satellite" tab** — grouped list
8. **"By Sprinkler" tab** — search + table
9. **Header button on `/irrigation` page** — link to the map
10. **Verification** — start dev server, walk through add/edit/delete/lookup
    flows in the preview browser, confirm no console errors

## Out of scope for this iteration

- Satellite metadata (location notes, owner, photos)
- Linking sprinklers to existing `irrigation_zones` rows
- Bulk import / CSV upload
- Sprinkler model, brand, GPM per head, last-serviced date
- Multi-org / tenant isolation beyond the existing pattern
- Running a sprinkler from the app (no Rainbird API integration)
- Sprinkler health / outage tracking

These can all be added later without breaking the schema above.
