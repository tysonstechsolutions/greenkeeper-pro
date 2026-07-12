# Equipment PM & Readiness Engine — Design Pass

**Date:** 2026-07-12 · **Author:** Fable · **Status:** Design only — no code, schema, or data changes made.
**Goal:** Turn GreenKeeper Pro into a maintenance-management system that lets a General Manager *without a superintendent* see equipment readiness at a glance and prevent failures before they happen.

---

## 0. What I found in the existing system (grounding)

I reviewed the live schema and the app code. The important discovery: **most of the plumbing already exists — the data does not.**

### Already built (reuse, don't recreate)
| Table | Rows (live) | What it already holds |
|---|---|---|
| `equipment` | **117** (58 operational / 59 out_of_service) | name, type, make, model, year, serial, asset_tag, **status**, **current_hours**, **service_interval_hours**, **next_service_due_hours/date**, condition, **needs_parts_ordered**, **parts_needed**, **estimated_repair_cost**, fuel_type, inspection flags |
| `equipment_service_records` | **51** | service_date, description, hours_at_service, cost, parts_used, sent_to_manufacturer, pickup/return dates |
| `equipment_parts` | 0 | name, part_number, quantity, **status**, estimated_cost, delay_reason |
| `equipment_logs` | 0 | log_type, description, hours_at_service, cost, parts_used, vendor, **downtime_hours** |
| `equipment_inspections` | 0 | checklist_items, overall_status, engine_hours, fuel/oil level |
| `fy26_assets` | 211 (**117 linked to equipment**) | asset_number, original_value, status, cost_center, site |
| `order_items` / order list | — | the parts→order→PR pipeline |
| `work_orders` | — | facility/vendor work requests |

`equipment.status` is already a clean enum: `operational | needs_service | in_repair | out_of_service | retired`. The `useEquipment` hook already auto-flips a unit to `needs_service` when logged hours pass `next_service_due_hours`, and auto-computes `next_service_due_hours = current_hours + service_interval_hours`.

### The real gap (verified live — this is what "do not invent equipment data" means in practice)
- **0 of 117 units have engine hours recorded** (`current_hours` all null/0).
- **0 units have a service interval set** (`service_interval_hours` all null/0).
- **0 rows in `equipment_parts`, `equipment_logs`, `equipment_inspections`.**
- **`make` is missing on ~half** the units (model + fuel_type are complete).

**Design consequence:** the schedule and prediction machinery must be built to **degrade gracefully** — the readiness dashboard has to be useful on day one from `status` alone, and light up progressively as you feed it hours and manufacturer intervals. We will not fabricate a single hour reading or interval.

### What's genuinely missing structurally (needs new tables)
1. **Meter-reading history.** `equipment.current_hours` is a single latest value with no history, so we can't compute a **usage rate** (hours/week) and therefore can't *predict* when a unit will hit its next service. We need a readings log.
2. **A real maintenance schedule.** `service_interval_hours` is one number per unit — it can't express "oil every 50 h, hydraulic filter every 250 h, reel backlap every 100 h, annual coolant flush." Manufacturer schedules are multi-item and mixed hour/calendar. We need a schedule-items table.
3. **Readiness/cost derivation.** No view computes fleet readiness, cost-per-hour, or downtime cost today.

The recurrence engines that exist (`operations/engine.ts` = monthly/quarterly/annual obligations; `my-day/recurrence.ts` = daily→yearly tasks) are **calendar-only**. Neither can trigger on engine hours. The PM engine is new architecture — that's the Fable piece.

---

## 1. Architecture proposal

### Design principle (consistent with the rest of the app)
**Deterministic engine computes; the UI and AI only present.** Just like `financial-watch/engine.ts` and `operations/engine.ts`, the PM engine is a pure function: given a unit + its schedule + its service history + its latest reading + usage rate → it returns each item's status (`ok` / `due_soon` / `overdue`) and a predicted due date. No AI ever decides whether a machine is due for service. AI is only allowed to *narrate* ("3 units are overdue; the greens mower needs a hydraulic filter") and *draft* (a capital-request paragraph).

### New module: `src/lib/equipment/pm-engine.ts` (pure, no I/O — mirrors operations/engine.ts)
Core functions (design intent, not final signatures):
- `usageRate(readings)` → hours/day from the reading history (falls back to null when <2 readings — then hour-based prediction is disabled, calendar items still work).
- `evaluatePmItem(item, lastCompletion, currentHours, usageRate, today)` → `{ status, dueInHours, predictedDueDate, basis }`. Handles hour-interval items, calendar-interval items, and either/both.
- `evaluateUnit(unit, scheduleItems, serviceHistory, readings, today)` → `{ readiness, dueItems[], nextDue, flags[] }`.
- `fleetReadiness(units[])` → the dashboard rollup counts.

Prediction (Capability 2 "future maintenance"): `predictedDueDate = today + (dueInHours / usageRate)`. Deterministic, explainable, and it simply doesn't render a prediction when there's no usage rate yet — no guessing.

### Where derived numbers come from
- **Readiness status per unit** = deterministic function of `equipment.status` + open `equipment_parts` (status not `received`) + any `overdue` PM item. Computed in the engine, optionally surfaced as a `equipment_readiness` view for cheap dashboard reads (117 rows — well under the PostgREST 1000-row cap, so a view is optional, not required).
- **Cost-per-hour** = (Σ service_record.cost + Σ log.cost) ÷ hours operated (from readings). A rollup view `equipment_cost_rollup`.
- **Downtime cost** = downtime_hours × a configurable downtime day-rate (seeded from the documented rental substitute cost, e.g. the $4,738 / 28-day tractor rental in the master plan — used as the "what a down mower costs us" reference, editable).

---

## 2. Database changes needed

All additive and idempotent. No existing column is dropped or repurposed. (Migrations are hand-applied via the Management API per house process; each ships with a commented rollback block.)

### New table: `equipment_meter_readings`
Reading history → enables usage rate + prediction.
```
id                uuid pk
equipment_id      uuid  -> equipment(id)  (indexed)
reading_hours     numeric  not null
reading_date      date     not null
recorded_by       uuid  -> profiles(id)  null
source            text  ('manual' | 'inspection' | 'service')  default 'manual'
note              text  null
created_at        timestamptz default now()
```
`equipment.current_hours` stays as a cached "latest reading" (the app already reads it everywhere); a new reading updates both. RLS: authenticated (kiosk model), same as the rest of the equipment domain.

### New table: `pm_schedule_items`
The manufacturer maintenance schedule. **Scoped so one entry can cover many identical units** (a fleet has several of the same mower) — you attach a schedule to an *equipment type* or an individual unit.
```
id                uuid pk
scope_type        text  ('equipment' | 'equipment_type' | 'make_model')
scope_value       text            -- equipment_id, or the type/make+model key
name              text  not null   -- "Engine oil & filter"
interval_hours    integer null     -- e.g. 50   (null = not hour-based)
interval_days     integer null     -- e.g. 365  (null = not calendar-based)
first_due_hours   integer null     -- break-in service, optional
severity          text ('routine' | 'critical')  default 'routine'
manual_reference  text null        -- "Toro 04358 op manual p.32"
instructions      text null        -- the procedure steps
active            boolean default true
created_at / updated_at
```
An item may have `interval_hours`, `interval_days`, or both (whichever comes first is due). This is what `service_interval_hours` (one scalar) cannot express.

### Extend `equipment_service_records` (mark which PM item a service satisfied)
Add nullable columns so a completed service can "tick off" a scheduled item and reset its clock:
```
pm_item_id        uuid null  -> pm_schedule_items(id)
meter_hours_at    numeric null  -- reading captured at service (may differ from hours_at_service)
```
This reuses the existing 51-row service history as the PM **completion log** — no separate completions table needed. The engine finds "last completion of item X" from these records.

### New rollup views (security_invoker, GRANT SELECT to authenticated — house pattern)
- `equipment_readiness` — one row per non-retired unit: derived readiness bucket + reason. (Optional; hook can compute instead.)
- `equipment_cost_rollup` — per unit: total service+repair cost, total downtime hours, hours operated, cost-per-hour.

### Reference/config
A row in the existing `app_settings` for `downtime_day_rate` (seeded editable, from the documented rental cost). No new table.

**No enum changes required** — `equipment.status` already has everything the readiness board needs.

---

## 3. Screens needed

### S1 — Equipment Readiness Dashboard *(new; the centerpiece)*
Route: `/equipment` (promote to a real workspace landing) or `/equipment/readiness`.
- **Fleet header:** 4 count tiles — Operational · Down · Waiting on Parts · Overdue for Service. (All computable from existing data today.)
- **"Needs attention today":** overdue PM items, units newly down, parts that arrived (ready to reinstall), inspections due. This is the GM's morning glance.
- **Unit list:** each row = name, status chip (color+text, never color alone — accessibility), hours, next-due (item + when/predicted), open-parts badge. Filter by status/type. Tap → S2.
- Degrades gracefully: before hours/intervals exist, it's still a live "what's up / what's down / what's waiting on parts" board driven by `status` + `needs_parts_ordered`.

### S2 — Equipment Detail (enhance existing `/equipment/view`)
Add tabs/sections to what's there:
- **Readiness & PM:** each scheduled item with status (ok/due-soon/overdue), last done (date + hours), next due (hours or predicted date). "Mark serviced" → writes an `equipment_service_records` row with `pm_item_id`, resetting the clock.
- **Meter log:** reading history + a prominent **"Log hours"** action.
- **Service history** (exists) · **Parts** (exists) · **Repairs** (S3).

### S3 — Repair workflow (structured flow inside S2, or a modal)
Guided path matching Capability 3: **Issue discovered → Diagnosis → Parts required → Vendor → Repair cost → Downtime → Return to service.** Backed by `equipment_logs` (log_type=`repair`, downtime_hours, cost, vendor) + `equipment_parts` (needed parts). Status transitions: `operational → needs_service/in_repair → (parts on order) → operational`. "Return to service" closes the log, records downtime, flips status back, and can prompt a fresh hours reading.

### S4 — "Log hours" quick action (mobile-first)
A tiny high-frequency screen: pick unit → type hours → save. This is the data engine of the whole system; it must be a 5-second interaction the mechanic or GM does at end of day. Optionally batchable (log several units at once).

### S5 — Replacement & Capital Planning
Route: `/equipment/replacement` (or surfaced under Money / links to `/capital-projects`).
- **Repair-vs-replace** per unit: lifetime repair cost vs original value / replacement estimate, age, cost-per-hour trend, downtime. A clear "repair | watch | replace" recommendation (deterministic thresholds, editable).
- **5-year replacement plan:** prioritized list with estimated replacement cost per year → exportable as a **capital request** (reuses the existing report/PDF pattern; can seed a `capital_projects` row).

### S6 — Today integration (not a new screen; a section)
An "Equipment" block on `/today` (see §5).

---

## 4. Workflow design

### PM lifecycle (Capability 2)
```
Attach manufacturer schedule to a unit/type (pm_schedule_items)
        │
Log hours regularly (equipment_meter_readings)  ──► usage rate
        │
PM engine computes each item: ok / due_soon / overdue + predicted date
        │
Due item surfaces on Today + unit detail
        │
Perform service ──► "Mark serviced" writes service_record(pm_item_id, hours)
        │
Item clock resets; next occurrence recomputed (lazy, like the obligations engine —
no pre-materialized future rows)
```

### Repair lifecycle (Capability 3)
```
Issue found (status → needs_service/in_repair; downtime clock starts)
   → Diagnosis (log entry)
   → Parts required (equipment_parts; if outside-sourced → order_items → PR)
   → Vendor involvement (log.vendor; sent_to_manufacturer / pickup / return dates)
   → Repair cost + downtime captured (log.cost, log.downtime_hours)
   → Return to service (status → operational; prompt new hours reading)
```

### Replacement decision (Capability 4)
```
Cost rollup (repair $ + downtime + cost/hour) vs original value / replacement estimate + age
   → deterministic recommendation (repair | watch | replace)
   → feeds 5-year plan → capital request document → optional capital_projects row
```

---

## 5. Integration plan

- **Today dashboard** — a new "Equipment" section using the same `ObligationRow`-style pattern already on `/today`: overdue/due-soon PM items, units that went down, parts that arrived (reinstall), inspections due. This is the "requires attention today" feed, so the GM sees fleet risk next to obligations and My Day.
- **Financial Watch** — add an equipment lens: repair-spend pace, a flag when a unit's cumulative repair cost crosses a % of its value (repair-vs-replace crossover), and downtime cost as a line. Deterministic engine feeds it; the advisor narrates. Consistent with the "engine computes, AI narrates, never invents $" rule.
- **Procurement** — the parts chain already exists: a needed part (`equipment_parts`) → order list (`order_items`) → PR. PM/repair flows create the order_item with the part + estimated cost pre-filled, so "this mower needs a hydraulic filter" becomes a purchasable line in two taps. `sent_to_manufacturer` service records already model the vendor round-trip.
- **Tasks / My Day** — a due PM item can spawn a dated task carrying the `instructions` (procedure) and required parts, so scheduled maintenance shows up as actual assigned work, not a static "service the mower" reminder.
- **Assets** — `fy26_assets` ↔ `equipment` is already linked for all 117 units; readiness and cost-per-hour surface on the asset view, and a "beyond repair" recommendation aligns with the existing disposal flow (`asset_disposals` / DD-forms).

---

## 6. Required documents / data from you (nothing gets invented)

**Blocking for prediction & PM scheduling (the big two):**
1. **Engine/meter hours** for the units — currently **0 of 117 recorded**. Even a one-time reading per operational unit starts the clock; a second reading later gives usage rate and predictions. Priority: the units the mechanic rebuilt and the greens/fairway mowers.
2. **Manufacturer maintenance schedules** for your key makes/models — the actual service intervals (oil, filters, hydraulics, backlap, coolant, greasing) from the operator manuals. PDF or photos of the maintenance pages are ideal. **Intervals must come from the manuals; I will not guess them.** We can attach one schedule per make/model and it covers every matching unit.

**Improves accuracy (non-blocking):**
3. **Which units are critical** (greens mowers, sprayer, the rented-tractor substitutes) so the dashboard prioritizes them.
4. **Down-unit reasons** — for the 59 out-of-service units, what each is waiting on (part, diesel vendor, beyond repair). This populates "waiting on parts" and the repair backlog immediately.
5. **`make` for the ~half of units missing it** (model + fuel are already complete).
6. **Shop/labor rate** and a **downtime day-rate** reference (the ~$4,738 / 28-day rental is a good starting proxy) — for cost-per-hour and downtime cost.
7. **Replacement cost estimates** for the priority units — for the 5-year plan / capital request (can be rough; flagged as estimates).

**Note on realism:** you're a GM without a superintendent and a one-mechanic shop. The design assumes you will *not* hand-enter 117 manuals. So the plan front-loads value that needs *no* new data (Phase A), then captures hours/intervals only for the units that matter, starting with the operational and critical ones.

---

## 7. Recommended development phases

Each phase ships working and tested before the next; early phases need no new data from you.

- **Phase A — Readiness dashboard from existing data (no new data required).** S1 + the Today section, driven by `status` + `needs_parts_ordered` + any existing `next_service_due_date`. Immediate "what's up / down / waiting on parts" visibility for all 117 units. *Best first ship; ideal Terra task.*
- **Phase B — Meter readings + PM engine (core).** `equipment_meter_readings` + `pm_schedule_items` + `pm-engine.ts` + S2 PM/meter tabs + S4 log-hours. Lights up as you feed hours and one manufacturer schedule. *Fable-led (new engine + schema).*
- **Phase C — Repair workflow.** S3 structured issue→return-to-service, downtime capture, procurement tie-in. *Terra, on Fable's data model.*
- **Phase D — Cost & replacement planning.** Cost-per-hour + downtime rollups, repair-vs-replace, 5-year plan, capital-request export. *Fable design (views + thresholds) → Terra builds the screen/report.*
- **Phase E — Deeper integration.** Financial Watch equipment lens; PM item → dated task with procedure. *Fable design → Terra wiring.*

---

## 8. Terra implementation handoff — Phase A (Readiness Dashboard)

**Task title:** Equipment Readiness Dashboard (Phase A)
**Business objective:** Give the GM a single screen showing what equipment is operational, down, waiting on parts, and overdue for service — using data that already exists, so it works before any hours/manuals are entered.
**Why needed:** The fleet being down is the operation's #1 constraint; today its status lives only in the GM's head and scattered `equipment` rows.
**Current behavior:** `/equipment/view` shows one unit at a time; there is no fleet-level readiness view. `useEquipment` already loads all units with `status`, `needs_parts_ordered`, `parts_needed`, `next_service_due_date`, `estimated_repair_cost`.
**Required behavior:** A dashboard with (1) four count tiles — Operational / Down (`out_of_service` + `in_repair`) / Waiting on Parts (`needs_parts_ordered=true` or open `equipment_parts`) / Overdue for Service (`needs_service`, or `next_service_due_date` in the past); (2) a "Needs attention today" list; (3) a filterable unit list linking to `/equipment/view`.
**Files to inspect:** `src/lib/hooks/useEquipment.ts`, `src/app/equipment/view/page.tsx`, `src/app/today/page.tsx` (ObligationRow section pattern), `src/lib/layout/app-catalog.ts` (nav), `src/components/layout/*` (HubPage/WorkspaceLanding).
**Files likely to change/create:** new `src/app/equipment/page.tsx` (or `/equipment/readiness`), a small pure helper `src/lib/equipment/readiness.ts` (bucket a unit → readiness), a nav entry in `app-catalog.ts`.
**Database objects affected:** none (read-only over existing `equipment` / `equipment_parts`).
**APIs affected:** none (client reads via existing hook).
**Existing patterns to follow:** the `/today` section layout, `equipmentStatusColors/Labels` from `useEquipment`, theme tokens (no hard-coded bg colors), color-plus-text status chips (accessibility).
**Required validation:** handle 0-hours/0-interval gracefully (no "overdue" false positives when no interval exists — only flag overdue on `needs_service` status or a real past `next_service_due_date`).
**Permission requirements:** standard authenticated kiosk (no anon).
**Audit requirements:** none for a read-only view.
**Edge cases:** retired units excluded; a unit both down and waiting-on-parts counts in both tiles but appears once in the list; make missing → show model.
**Tests required:** unit tests for `readiness.ts` bucketing (each status → correct tile; parts-open logic; overdue only when interval/date present); a component smoke test for the dashboard.
**Acceptance criteria:** all 117 units appear; tiles sum correctly; no false "overdue" while intervals are empty; links open the right unit; typecheck + lint clean; existing tests stay green.
**Out of scope:** meter readings, PM schedules, prediction, repair workflow, cost/replacement — those are Phases B–D (Fable).
**Risks:** low (read-only, additive route). **Rollback:** delete the new route + helper + nav entry.

The Phase B PM engine, the two new tables, the rollup views, and the cost/replacement logic stay with **Fable** — they are new cross-module architecture (a meter-hour cadence the existing engines don't have) and must be designed before Terra builds the screens on top.

---

## 9. Summary for approval

- The PM **plumbing largely exists**; the **data (hours + manufacturer intervals) does not** — and won't be invented.
- New structural pieces: **`equipment_meter_readings`**, **`pm_schedule_items`**, two nullable columns on `equipment_service_records`, and two rollup views. Everything else is reuse.
- **Phase A ships value with zero new data from you** (readiness board) and is a clean Terra handoff.
- **Phases B–D need the two blocking inputs** (some hours readings + at least one real manufacturer schedule) and are Fable-led on the engine, Terra on the screens.

Awaiting your go-ahead and, when ready, the two blocking inputs to open Phase B. No code until you approve.
