# Audit — why the app cannot tell the GM what to do (2026-07-15)

Assessment performed before building the Golf Program Standards Framework.
Every claim below is grounded in a file/table read during the audit.

## Executive finding

**The app's rigor is inversely distributed relative to its intent.** The duty/task
execution layer is genuinely enforced at the database level. The layer that is
supposed to *steer* it — standards and goals — is a static file and a dead table.
The execution engine is excellent and is being directed by nothing.

## 1. Standards exist, but are inert

`/standards-plan` (`src/app/standards-plan/page.tsx`, 706 lines) renders the real
FY24 Navy Standards assessment for Veterans Memorial GC, NS Great Lakes
(`as_of: 2026-05-22`): 93 scored gaps, 5 sections (Personnel, Facilities,
Programs, Equipment, Administration), P1×16, `total_cost_estimate: $318,150`,
owners (Leadership 9, Superintendent 27, GCM 36, Crew 18, Mechanic 3).

Problems:
- Data is a **static file**: `public/data/standards_plan.json` (105KB), loaded via
  `fetch("/data/standards_plan.json")`. Not in the database.
- Status + notes persist to **localStorage only** (`vmgc_standards_plan_status_v1`).
  Per-browser, per-device, unshared, unauditable, lost on cache clear.
- `PlanEntry.owner` is a **free-text string**, not a `profiles` FK — work cannot be
  assigned to a real person.
- No linkage to duties, tasks, equipment, observations, or obligations.

## 2. Goals are passive text

- `plan_goals` (001_initial_schema.sql) is the ONLY model with `target_metric`,
  `target_value`, `actual_value`, `parent_goal_id`. It has **zero write paths**.
  Only two reads exist (`generate-briefing.ts:331`, `useReports.ts:1037`). No UI
  creates or edits one.
- `tasks.plan_goal_id` is hardcoded `null` at every call site
  (`useTaskTemplates.ts:291`, `useScheduleBoard.ts:582`).
- `daily_goals` → `daily_steps` only. **`daily_steps` has no `task_id` / FK to
  `tasks`.** Goals produce checkboxes, not work.
- **BUG:** `useReports.ts:1038` selects `progress_percent, target_date` from
  `plan_goals`. Neither column exists in any of the 122 migrations. That path has
  never run against real data.

## 3. Nothing improves a measurable score

- `course_zones.condition_score` (1–10) has **no write path in the codebase** —
  every reference is a read (`course-map-component.tsx:207`,
  `mini-map-widget.tsx:39`). Defined in the initial schema, never set.
- Completing a step sets `done: true` + `done_at`. Nothing else moves.
- `BriefingMeta.factsOnly: true` — the briefing is deliberately non-evaluative.
  `BriefingFinding` has no severity, rank, weight, or score.

## 4. My Day carries none of the required fields

`DailyStep` = `id, goal_id, title, target_date, done, done_at, sort_order,
urgent, source, source_ref, created_by, created_at, updated_at`.

| Required by GM | Present on daily_steps? |
|---|---|
| why it matters | NO |
| priority | NO (only `urgent: boolean`) |
| location | NO |
| instructions | NO |
| evidence required | NO |
| definition of done | NO (`definition_of_done` appears nowhere in repo) |
| estimated duration | NO |
| blockers | NO |
| linked standard / asset | NO |

The richness exists on `operation_duties` / duty-backed `tasks`
(`instructions`, `evidence_requirements`, `estimated_minutes`, `priority`,
`standard_reference`, `manager_verification_required`) but never flows into
`daily_steps`. The two systems share a page and nothing else.

## 5. Five deficiency recorders, none feed the execution chain

| Source | Has severity | Creates work automatically? |
|---|---|---|
| `hole_observations` / `green_observations` | `priority` critical..low | NO — manual "Create Task from This" button only |
| `equipment` triage (`triage_status`, `down_since`) | down/needs_service | NO — zero inserts to tasks/WO/PR |
| `equipment_inspections` | `overall_status` | NO — no recurrence, no due date |
| `ast_inspections` | per-item yes/no/na | NO — a `no` creates nothing |
| `environmental_logs` | `severity` routine..critical + `corrective_action` + `corrective_deadline` | NO — free text, no FK, nothing alarms on the deadline |

The only automatic cross-entity linkage in the app is the WO↔clubhouse issue sync.

## 6. The execution engine is excellent — and unsteered

`operation_duties` + `duty_assignments` + `task_series` + `tasks` (Phase 1A):
- `guard_task_mutation()` — field-level allowlists; completed/verified rows are
  immutable; verified cannot be reopened; `verified_by := auth.uid()` forced.
- `task_required_evidence_satisfied()` blocks completion: `'Required evidence is missing'`.
- `duty_audit_events` with `reason NOT NULL`, before/after state.
- Versioned recurrence (`duty_recurrence_versions`) + GiST EXCLUDE no-overlap on
  both assignments and recurrence.
- Tri-state `not_recorded | not_required | required` — honestly distinguishes
  "unknown" from "nothing needed".

This is the right foundation. Corrective actions should REUSE it, not duplicate it.

## 7. Unowned work is invisible

- `duty_assignments.assignee_type = 'unassigned'` is first-class and the Phase 1A
  backfill honestly recorded `'Phase 1A migration: ownership not recorded'`.
- `materialize_duty_occurrences` sets `assigned_to = NULL` for them.
- `/my-day` filters `assigned_to=eq.${user.id}` → unassigned occurrences appear in
  **nobody's** My Day.
- No query, filter, count, or alert for "duties with no owner" exists. Unowned work
  generates indefinitely and is shown to no one as a gap.

## 8. Authority mismatch (pre-existing risk)

- Client `MANAGEMENT_ROLES` = `super, asst_super, director, foreman, pro, gm`.
- Server `can_manage_daily_operations()` = `super, asst_super, director, gm` only.
- A foreman/pro sees management UI that the database will reject.
- RoleGuard IS a real check (`role-guard.tsx:36`), applied to only 13 of 121 pages.
  (Corrects a prior project memory that claimed it was pass-through.)

## What Today actually shows

Render order: Coming due (overdue/due_soon obligations + certs) → Equipment
attention (max 6) → duty rhythm → My Day (max 8) → This week (max 8) →
Workspaces tiles → All scheduled obligations (collapsed).

Exceptions do win the top of the page. But the day's actual work is unranked
chronological slices with a hard `.slice(0, 8)` cap and no "+N more" — items past
the eighth are silently invisible, not deprioritized.

## Conclusion

The gap is not "we need another task list". It is that **93 already-scored,
authoritative gaps live in a JSON file with localStorage status**, while a
DB-enforced execution engine sits idle next to five deficiency recorders that
feed it nothing. The build must connect those, not add a sixth recorder.
