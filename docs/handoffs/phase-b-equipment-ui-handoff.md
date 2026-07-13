# Terra Implementation Handoff — Phase B Equipment UI & Workflows

**Prepared:** 2026-07-13 by Fable · **For:** Terra
**Foundation commit (already merged path):** `3eb455e` on branch `equipment/phase-b-foundation`
**Parent design:** `docs/plans/2026-07-12-equipment-pm-readiness-engine-design.md`
**Mode:** Phase B in **data-incomplete mode**. No meter readings, manuals, serials, or intervals exist and none may be invented.

---

## What Fable already built (do not rebuild — import and use)

Migration `20260713_phase_b_equipment_triage.sql` is **applied live**. New, additive, nullable:
- `equipment.triage_status` — 9-state CHECK (nullable). `equipment.down_since` — date.
- `equipment_inspections.inspection_type` now also allows `'triage'`.
- `equipment.status` is unchanged and remains the **source of truth**. Triage never overrides it.

Pure logic modules (all deterministic, no I/O — build the UI on top of these, don't re-derive):
- `src/lib/equipment/triage.ts` — `TRIAGE_STATES`, `triageLabel`, `triageMeta`, `isTriageAttention`, `isDiagnosed`, `triageOrder`, `downtimeDays`, `SUGGESTED_INITIAL_TRIAGE`.
- `src/lib/equipment/pm-status.ts` — `evaluatePmSafe(unit)` → `{ state, label, ... }`; `pmIsComputable(state)`. **Use this for every PM display.**
- `src/lib/equipment/inspection-checklist.ts` — `TRIAGE_CHECK_ITEMS`, `emptyTriageChecklist`, `summarizeTriageChecklist`, `TriageChecklistEntry`.
- `src/lib/equipment/completeness.ts` — `assessUnit`, `summarizeCompleteness`, `collectionQueue`, `COMPLETENESS_FIELDS`.
- Types in `src/types/database.ts`: `Equipment.triage_status`, `Equipment.down_since`, `EquipmentTriageStatus`.

**Hard rules (carry through every screen):**
- ❌ Never treat a missing value as zero. Missing = "Not recorded" / "—".
- ❌ Never show "due"/"overdue" except when `pmIsComputable(evaluatePmSafe(unit).state)` is true (it is false for all 117 units today — show the `label`, e.g. "PM schedule unavailable").
- ❌ Never infer triage, diagnosis, or condition from status or a photo — triage is human-set only.
- ❌ No purchasing, no replacement *recommendations* (a person may manually set `replacement_candidate`; the app must not suggest it from status).
- ❌ Do not start Phase C/D/E; do not touch unrelated modules.

---

## Task 1 — Equipment data-completeness assessment (screen)
**Objective:** Show what info each unit has vs is missing, with totals and filters.
- New tab/section (extend `/equipment` from Phase A, or a sub-route `/equipment/completeness`).
- Use `assessUnit(unit, { serviceRecordCount, partsCount }, asOfIso)` per unit and `summarizeCompleteness(...)` for the totals row. `asOfIso` = today (YYYY-MM-DD).
- Fields to display (from `COMPLETENESS_FIELDS`): Photo, Make, Model, Serial, Meter reading, PM schedule, Recent inspection, Service history, Repair diagnosis, Parts info.
- Show each field as **recorded / not recorded / not-applicable** (the helper returns `present`, `missing`, `notApplicable`). Diagnosis & parts are N/A for operational units — render them greyed, not "missing".
- Totals: "X of 117 missing a photo", etc. — straight from `summarizeCompleteness`.
- **Filters:** by status (reuse Phase A pattern), by "missing field" (e.g. show only units missing a photo), and a search.
- **Data:** you'll need per-unit `serviceRecordCount` and `partsCount`. Fetch `equipment_service_records` (id, equipment_id) and `equipment_parts` (id, equipment_id, status) in **one bulk query each** (not per-row) and reduce to counts by `equipment_id`. Give both an explicit high `limit` (e.g. 2000) so they don't hit the 1000-row default.

## Task 2 — Equipment triage workflow
**Objective:** Let a person classify each DOWN unit into one of the 9 states, without altering `status`.
- On the unit detail (`/equipment/view`) and/or an inline control on the readiness list: a triage selector rendering `TRIAGE_STATES` (label + description).
- On first triage of a down unit, default the selector to `SUGGESTED_INITIAL_TRIAGE` and set `down_since` to today **only if empty** (don't overwrite an existing episode date). Persist via `directPatchRow("equipment", "id", id, { triage_status, down_since })`.
- Show `downtimeDays(down_since, returnedOn=null, today)` as "Down N days" when `down_since` is set; show nothing (not "0") when it isn't.
- Setting triage to `returned_to_service` is a working annotation — it does **not** by itself flip `status`; prompt the user to also set status back to operational (that stays a deliberate, separate action). When they do, clear `down_since`.
- Do **not** compute or suggest a triage state from `status`. The selector starts blank ("Not triaged") for untriaged units.

## Task 3 — Triage inspection workflow
**Objective:** A simple structured inspection completable from current observations.
- New form writing to `equipment_inspections` with `inspection_type = 'triage'`.
- Render exactly `TRIAGE_CHECK_ITEMS` (10 items). Each is a 4-way control: **OK / Issue / Unknown / N/A**, defaulting to **Unknown** (from `emptyTriageChecklist()`). Optional per-item note.
- Also capture: overall notes, optional photo (reuse the existing photo-upload path used elsewhere on `/equipment/view`), and an **optional** "hour meter reading if visible" number → store in `equipment_inspections.engine_hours` (leave null if not visible; never default to 0).
- On save: compute `summarizeTriageChecklist(entries)` → store `overall_status` from `summary.overall` (a person may override to `fail`), store the entries in `checklist_items`, set `inspected_by`, timestamp. Update `equipment.last_inspection_date`.
- **Never** render manufacturer-specific service actions. This is observation only. "Unknown/not checked" must always be selectable.

## Task 4 — Repair & downtime tracking
**Objective:** Track a down episode end-to-end from real entries only.
- Reuse `equipment_logs` (log_type `repair`/`incident`) for events: description = work performed, `vendor`, `cost` (**only when the user enters an actual amount — never auto-fill or estimate**), `downtime_hours` optional, photos.
- Surface on the unit detail: **Date first reported down** (`down_since`), **Diagnosis status** (`triage_status`), **Parts required/ordered** (from `equipment_parts` + `needs_parts_ordered`/`parts_needed`), **Vendor involved** (from logs), **Work performed** (log descriptions), **Returned-to-service date** (the log/date when status went operational), **Downtime days** (`downtimeDays(...)`).
- **Repair cost** shows only amounts actually recorded in `equipment_logs.cost` / `equipment_service_records.cost`. If none, show "No cost recorded" — never `$0.00`, never `estimated_repair_cost` presented as an actual.

## Task 5 — Manual & PM-data collection queue (screen)
**Objective:** A prioritized "what to collect next" list — a queue, not a blocker.
- Use `collectionQueue(units, assessments)` → ordered entries `{ id, name, needs[], priority }` where `needs` ⊆ {meter, PM schedule, make, serial}.
- Render as a checklist the GM can work through; each row links to `/equipment/view?id=...`. Down units surface first (already encoded in `priority`).
- Header line: "N units still need meter readings / schedules / identity info." Framed as opportunity, never as an error or a block.

## Task 6 — Safe PM display everywhere
- Anywhere a unit's maintenance status is shown, call `evaluatePmSafe(unit)` and render `result.label`. Only when `pmIsComputable(result.state)` show due/overdue styling. Today every unit returns an `unavailable_*` state → show "PM schedule unavailable" / "Meter reading unavailable" plainly. Never a red "overdue" without computable data.

## Task 7 — Integration
- **Today:** add down-equipment needing attention (units with `isTriageAttention(triage_status)` **or** a down `status` and no triage yet) and any "needs inspection" units, using the existing `/today` section pattern. Keep it concise; link to the unit.
- **Procurement:** where a part is needed (`equipment_parts` / `parts_needed`), offer a "Add to order list" action that creates an `order_items` row (reuse the existing order-list create path — do not build a new procurement flow). No auto-ordering.
- Reuse existing equipment/service-record/parts/asset/task/procurement structures throughout; add no new tables.

---

## Permissions
Authenticated kiosk model only. All reads/writes go through the existing authenticated client. Do not reintroduce anon access; do not alter RLS (Phase 0B locked anon out — leave it).

## Tests required (Terra)
- The Fable logic is already unit-tested (34 tests). You add **component/interaction tests** for: the completeness screen (totals + a "missing photo" filter), the triage selector (setting a state patches `triage_status` and sets `down_since` once), the inspection form (defaults to all-unknown; saving writes `inspection_type:'triage'` and derives `overall_status`), and the collection queue ordering (down first). Keep `npm run typecheck`, `npm run lint` clean and the full suite green (currently **734**).

## Acceptance criteria
- [ ] Completeness screen shows recorded/not-recorded/N-A per field for all 117 units; totals match `summarizeCompleteness`; missing never shown as `0`/zero-value.
- [ ] Triage selectable on down units; `status` never changes as a side effect; `down_since` set once; "Down N days" shown only when dated.
- [ ] Triage inspection saves with `inspection_type:'triage'`, defaults to all-Unknown, allows Unknown/N-A, prescribes no manufacturer actions.
- [ ] Repair/downtime shows real entries only; cost shown only when actually recorded.
- [ ] Collection queue prioritized (down first), links to units, framed as non-blocking.
- [ ] No unit ever displays due/overdue while PM data is absent; "unavailable"/"unable to calculate" shown instead.
- [ ] Today surfaces urgent down/inspection needs; parts route to the existing order list.
- [ ] typecheck + lint clean; full suite green; no new tables/columns/migrations; anon untouched; no unrelated modules changed.

## Out of scope (Fable / later phases)
PM scheduling from manuals, engine-hour prediction, cost-per-hour & downtime-cost rollups, replacement analysis/recommendations, Financial Watch equipment lens, Phase C/D/E.

## Return to Fable
Commit (don't push) on a branch; report files changed, test results, and anything you found sparser or inconsistent versus this handoff.
