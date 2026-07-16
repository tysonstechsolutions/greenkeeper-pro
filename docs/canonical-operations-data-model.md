# Canonical operations data model

## Design principles

1. A requirement explains why work exists; a template explains how it repeats; a run identifies the business period/event; a task occurrence records executable work.
2. Definitions are versioned. Occurrences snapshot effective facts and never change when a future definition changes.
3. A domain record (asset, inspection, meeting, report, incident, PR) remains authoritative for its facts. It links to canonical work rather than becoming another task table.
4. Every protected mutation is a database command/RPC that derives the actor from `auth.uid()` and records an audit event.
5. Mandatory, local, recommended, and AI-proposed work are visibly distinct.
6. Unknown data remains unknown. Null/`not_recorded` must not be converted to zero, complete, safe, or not required.

## Core relationships

```text
authority_source 1--* requirement 1--* requirement_version
requirement_version *--* workflow_template_version
workflow_template 1--* workflow_template_version 1--* workflow_step_template
workflow_template_version 1--* deadline_rule / trigger_rule / escalation_rule

responsibility_assignment -> requirement/template/step
responsibility_assignment 1--* temporary_coverage

workflow_run -> period, event, inspection, report, meeting, project, incident
workflow_run 1--* task_occurrence
task_occurrence *--* task_dependency
task_occurrence 1--* task_evidence
task_occurrence 1--* approval
task_occurrence 1--* verification
task_occurrence 1--* corrective_action link

all material records -> audit_event
all notification-worthy transitions -> outbox_event -> notification_delivery
```

## Source and standards entities

### `authority_sources`

Represents issuing organizations and controlled sources.

Key fields: `id`, `authority_name`, `authority_type`, `jurisdiction`, `source_url/path`, `document_hash`, `effective_date`, `revision_date`, `superseded_by`, `last_checked_at`, `checked_by`, `access_classification`.

Do not infer applicability merely because a source exists.

### `requirements`

Stable identity for a standard, policy, SOP requirement, permit condition, or local management standard.

Key fields: `id`, `code`, `title`, `department`, `classification` (`verified_requirement`, `local_management_standard`, `recommended_best_practice`, `draft_needing_confirmation`, `not_applicable`, `retired`), `authority_source_id`, `applicability_state`, `applicability_detail`, `confirmed_by`, `confirmed_at`, `current_version_id`, `is_active`.

### `requirement_versions`

Immutable material version: citation/reference, requirement summary, effective/revision dates, frequency/deadline rule reference, responsible role, evidence contract, retention rule, approval/verification/escalation needs, source document, local interpretation, and change reason/actor.

Existing mapping: evolve `program_standards` into the stable requirement catalog and use `program_standard_versions` as true immutable versions. Add classification values matching the product labels, not only the current source types.

### `sops`, `sop_versions`, `checklist_templates`, `checklist_template_versions`, `checklist_items`

Separate explanatory procedure from enforceable requirement. Checklists are versioned, ordered, typed, and can contain conditional branches. An inspection/task snapshots the checklist version used.

Existing mapping: migrate approved `onboarding_documents`, `knowledge_articles`, `inspection_checklists/items`, and structured duty instructions where appropriate. Do not convert prose to an official checklist without owner validation.

## Workflow definition entities

### `workflow_templates`

Stable identity for staged operational workflows such as monthly scheduling, payroll close, one-on-ones, tank inspections, report preparation, and asset collection batches.

Fields: `id`, `slug`, `title`, `department`, `requirement_id`, `classification`, `status` (`draft`, `approved`, `retired`), `current_version_id`, `created_by/at`.

### `workflow_template_versions`

Immutable version with applicability, run key strategy, time zone, activation window, owner role, capacity/batch settings, evidence/verification defaults, effective range, approval actor/date, and change reason.

### `workflow_step_templates`

Fields: `id`, `workflow_version_id`, `step_key`, `title`, `description`, `sequence`, `responsible_role`, `deadline_rule_id`, `condition_rule_id`, `depends_on_step_key`, `estimated_minutes`, `location/skills/equipment`, `evidence_contract`, `verification_contract`, `completion_effect`, `is_optional`.

### `deadline_rules`

Typed deterministic rules:

- fixed local date/time;
- daily/weekday/weekly;
- Sun-Sat pay period close;
- day/last day/nth weekday of month;
- quarter/fiscal period;
- backward offset from month end/event/report due date;
- relative to previous step completion;
- renewal window before expiry;
- seasonal window with configured local dates;
- business-day/holiday adjustment;
- event/inspection/metric triggered.

Each rule has `time_zone`, `parameters`, `version`, `effective_range`, and tests. No free-text deadline is authoritative.

### `trigger_rules` and `trigger_evaluations`

A trigger rule names the source entity/event, deterministic predicate, severity mapping, proposed template/action, idempotency key, and whether activation is automatic or approval-required. Evaluation records store rule version, source snapshot/hash, outcome, reason, evaluated time, and proposal/action link.

### `escalation_rules`

Stages such as owner reminder, backup handoff, supervisor alert, manager review, operational stop, or corrective action. They reference elapsed time/missed count/risk and notification templates. Consequences are locally/officially approved, never AI-invented.

## Responsibility and workforce entities

### `employees`, `roles`, `departments`, `employee_role_assignments`

`profiles` remains the authenticated person record. Normalize operational roles/departments and effective dates rather than relying only on one `role` string. Keep private HR profile data in separate restricted tables.

### `responsibility_assignments`

Temporal owner/backup/contractor assignment for a requirement, workflow, or step. Fields mirror the successful Phase 1A pattern: subject type/id, primary/backup/contractor, effective range, reason, actor, non-overlap constraint.

Existing mapping: generalize `duty_assignments`; keep it intact during migration and expose a compatibility view.

### `temporary_coverages`

Effective-dated replacement with reason/approver and non-overlap. Existing `duty_temporary_coverages` remains the reference implementation.

### `skills`, `employee_skills`, `availability`, `shift_assignments`

Support capacity and safe assignment. Certification/training requirements link roles/skills to requirement versions. Do not auto-assign until these facts are sufficiently populated.

## Execution entities

### `workflow_runs`

One business instance: month schedule run, pay period, report period, event, inspection, meeting, onboarding, or asset collection batch.

Fields: `id`, `workflow_version_id`, `run_key`, `source_type/id`, `period_start/end`, `target_due_at`, `status`, `owner`, `generated_at/by`, `approved_at/by`, `closed_at/by`, `data_quality_state`, `unique(workflow_version_id, run_key)`.

### `tasks` (canonical task occurrences)

Keep the existing table as the execution kernel. Add/generalize:

- `work_type` and `workflow_run_id` / `workflow_step_template_id`;
- `source_type/id/ref` and `generation_key`;
- `requirement_id/version_id`, classification, why, definition of done;
- deadline rule snapshot, escalation state, missed count;
- assignment/coverage snapshot;
- dependency/capacity metadata;
- evidence and verification contract snapshot;
- `data_quality_state` and `mandatory_state`;
- archive/void/correction semantics without destructive history.

Keep `occurrence_key` uniqueness and `guard_task_mutation` principles.

### `task_dependencies`

Typed relation (`blocks`, `finish_to_start`, `approval_before`, `evidence_from`, `same_work_session`) with optional lag and workflow-version source.

### `task_evidence`

Generalize `task_evidence_items` and existing photo links. Typed evidence has requirement key, type, storage object/document/external reference, note, captured actor/time, hash/version, verification state, retention policy, and immutable correction chain.

### `approvals` and `verifications`

Generic records linked to task/run/report/meeting/PR/incident. Store requested/decided actor and role, decision, reason, timestamp, object version/hash, independence requirement, and supersession. Self-verification is rejected where independent verification is required.

### `corrective_actions`

One generic link from a finding/gap/incident/inspection/metric to a canonical task/run. Existing `standard_corrective_actions` can become a typed view/subtype. Status must be derived from linked execution and verification, not independently drift.

## Domain entities and their relationship to work

| Domain | Authoritative entity | Link to canonical work |
|---|---|---|
| Projects | `projects`, `project_milestones` | Milestones generate/link tasks; dependencies remain canonical. |
| Work orders | existing `work_orders` | Work order can be source/run; execution tasks link back; WO retains vendor/form facts. |
| Inspections | `inspection_definitions/versions`, `inspection_runs`, `inspection_responses`, `findings` | Failed finding proposes/creates corrective action under approved rule. |
| Meetings | `meetings`, `attendees`, `agenda_items`, `decisions`, `meeting_actions` | Preparation and action items are canonical tasks. |
| Reports | `report_definitions/versions`, `report_runs`, `report_sources`, `report_versions`, `report_submissions` | Preparation/review/approval tasks link to report run. |
| Events/leagues | `events`, `event_versions`, registration/pricing/staffing/financial closeout | Event workflow run creates cross-department tasks. |
| Follow-ups | `follow_ups` linked to communication/person/vendor/customer/meeting/inspection | Follow-up is a source wrapper whose next action is a canonical task. |
| Employees | `profiles` plus restricted HR/personnel entities | Assignment, availability, training, meetings, onboarding link by profile. |
| Assets/equipment | `assets` plus operational `equipment` subtype/link | PM/inspection/photo/repair rules create work; asset stays source of property facts. |
| Certifications/training | `qualification_requirements`, `employee_qualifications`, `training_events` | Renewal/restriction workflow generated from verified rule. |
| Incidents/safety | restricted `incidents`, `incident_parties`, `notifications`, `investigations`, `findings` | Approved notification/investigation/corrective workflows. |

## Communications, notifications, and audit

### `outbox_events` and `notification_deliveries`

Every transactional state change writes an outbox event in the same transaction. A worker creates channel-specific delivery attempts with retry/idempotency, status, destination class (not raw secret in general logs), and read/acknowledgment where appropriate.

### `audit_events`

Append-only: actor, action, object type/id/version, timestamp, request/idempotency key, reason, before/after safe snapshots, correlation/run/source IDs. Sensitive snapshots need field minimization/encryption/access policy. Domain audit tables may remain but should emit/project into the common stream.

## Existing-table disposition

| Existing object | Disposition | Rationale / migration note |
|---|---|---|
| `profiles` | Keep and extend carefully | Authentication identity source. Backfill/validate departments and effective role assignments; private HR facts remain separate. |
| `program_standards` | Keep -> canonical requirements catalog | Good stable codes/owners/source/evidence foundation. Align classification/source/applicability/validation fields. |
| `program_standard_versions` | Keep and make mandatory for material edits | Live count is zero; add atomic writer/version enforcement. |
| `standard_evaluations` | Keep append-only | Existing guard is good. Add orchestrator and input/rule version provenance. |
| `standard_corrective_actions` | Keep, then consolidate as corrective-action subtype/view | It correctly links standards to tasks; avoid separate drifting status. |
| `operation_duties` | Keep during migration | Strong standing-duty definition; later map to workflow template/version. |
| `duty_assignments`, `duty_temporary_coverages`, `duty_recurrence_versions`, `duty_audit_events` | Keep/reference implementation | Generalize pattern without rewriting history. |
| `task_series` | Keep compatibility, migrate to workflow versions/runs | Existing recurrence/generation path remains until parity proven. |
| `tasks` | Keep as canonical occurrence/execution table | Strongest enforced lifecycle. Generalize sources/types; preserve existing IDs/history. |
| `task_templates` | Migrate/consolidate | Convert to workflow template versions; compatibility view for old clients. |
| `daily_goals`, `daily_steps` | Keep as personal planning/projection only | Owner-scope immediately. Link/project canonical tasks; never treat step checkbox as authoritative completion. |
| `obligations`, `obligation_completions` | Migrate definitions/runs; preserve/audit history | Engine is useful; current model lacks tasks/evidence/verification. Compatibility view during transition. |
| `pro_shop_duties`, `duty_completions` | Retire after migration | Competing legacy source. Read-only now; migrate history and validate route parity first. |
| Schedule-board tables | Keep planning UI; consolidate execution | Board remains a view/editor over canonical occurrences after migration. |
| `staff_one_on_ones`, `staff_one_on_one_sessions`, `staff_records`, `staff_concerns` | Consolidate with restricted meeting/follow-up model | Separate schedule/session/follow-up is valid, but identity, privacy, and links must be explicit. |
| `calendar_events` | Keep as calendar projection or simple event source | Meetings/events need richer canonical entities; calendar alone is not workflow. |
| `certifications` | Migrate to employee qualifications | Free-text holder and one-row live data cannot prove position coverage. Preserve documents/history. |
| `equipment`, `fy26_assets` | Keep, link, then decide master/subtype by field | Operational fleet and accountable-property facts differ. Do not merge blindly. |
| Equipment service/parts/logs/inspections | Keep | Link generated work, effective inspection templates, and return-to-service verification. |
| `inspection_checklists/items`, `ast_inspections`, environmental tables | Migrate toward versioned inspection model | Preserve source records; add assets/findings/corrective links and validated templates. |
| `purchase_requests`, PR audit/code/budget tables, vendors | Keep | Strong domain workflow; add canonical approval/task/outbox links and least-privilege RLS. |
| `budget_items`, revenue/expense/capital/inventory tables | Keep, harden, populate | No fabricated data. Add source/close/snapshot and restricted access. |
| `tournaments`, checklist items | Migrate into event lifecycle | Preserve existing IDs; add versioned plan/cross-domain run/closeout. |
| `work_orders` | Keep | Domain source/document remains; link canonical execution and completion timestamps/history. |
| `created_documents`, briefing approved documents | Keep; add report-run/document-version relation | Preserve exact approved artifacts and hashes. |
| `notifications` | Keep as user inbox, backed by outbox/deliveries | Do not write ad hoc notifications outside event pipeline. |
| `activity_log` | Replace or project from canonical audit events | Current general log is incomplete. Preserve any existing rows during migration. |

## Migration sequence

1. Harden RLS/actor commands on current tables; add audit/outbox foundations.
2. Add canonical source, requirement version, workflow template/version/step, deadline/trigger/escalation, and run entities without changing current clients.
3. Add source/link/generation fields to `tasks` and compatibility views.
4. Implement deterministic generation/proposal commands and dual-read comparison in a preview/disposable environment.
5. Migrate obligations/templates/schedule work one domain at a time; preserve old IDs/period keys in mapping tables.
6. Make Today/My Day read the canonical projection; compare counts/status with legacy views.
7. Freeze legacy writers; retain read-only compatibility and audit for at least one validated operating cycle.
8. Retire only after data reconciliation, role/E2E acceptance, rollback plan, and explicit approval.

## Required invariants

- Unique occurrence/run/proposal keys under retry and concurrency.
- `auth.uid()`-derived actor for completion, verification, approval, assignment, and correction.
- No direct client mutation of protected historical facts.
- Material definition edits require reason/version and affect only future runs.
- Completed/verified/submitted records are immutable; correction is append-only.
- Independent verification cannot be self-performed when required.
- RLS follows parent/source privacy for evidence, people, financial, incident, and environmental records.
- Missing sources/data remain explicit and block confident status.
- Service jobs have narrow execute grants and idempotency; no broad table bypass in user paths.
