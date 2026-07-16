# Task-system gap analysis

## Verdict

The current task architecture cannot yet act as the General Manager's operational boss.

It contains one production-quality execution kernel - duty-backed rows in `tasks` - surrounded by several weaker work representations. Today composes them visually but does not normalize them. Live evidence makes the gap unmistakable: 649 duty-backed occurrences exist, all 649 are pending and unassigned, and there are zero task evidence records, verified tasks, duty audit events, temporary coverages, or recurrence-history records. The machine can generate rows; it is not running the facility.

## Current work sources

| Source | Intended use | Strength | Blocking gap | Disposition |
|---|---|---|---|---|
| `operation_duties` + `duty_assignments` + `task_series` + `tasks` | Standing duties and generated occurrences | Atomic management commands, idempotency, history protection, evidence/verification gates | Live ownership/execution absent; no general requirement/dependency/escalation model | Keep as canonical occurrence/execution kernel. |
| `tasks` one-time rows | Rich assigned tasks | Actor/status/evidence protections after Phase 1A corrective migration | Hidden legacy UI, categories biased toward course work, no general source contract | Keep; evolve through canonical command API. |
| `task_templates` | Reusable task defaults | Checklist/instructions/photo flags | No versioned deadline rule, workflow stages, policy/source, approval, or trigger | Migrate into workflow template/version model; retain compatibility view. |
| `daily_goals` + `daily_steps` | Personal planning and AI breakdown | Simple UX, buffer scheduling, end-of-month recurrence | Checkboxes lack why/source/priority/evidence/verification/ownership/history; client-side generation | Keep only as personal plan/projection; stop treating as authoritative completion. |
| `obligations` + `obligation_completions` | Recurring management anchors | Deterministic weekly/monthly/quarterly/annual debt, lead-time display, and live actor-attributed audited completion RPC | Descriptive evidence only; no task occurrence, staged workflow, dependency, or escalation | Migrate definitions into requirements/workflow templates; preserve completions/audit. |
| Schedule board items/templates | Course schedule work | Useful planning grid and recurrence | Separate assignment/completion model; not Today/report canonical | Project into canonical tasks; preserve board as planning view. |
| `pro_shop_duties` + `duty_completions` | Legacy shop duties | Historical compatibility | Competing writer/model | Read-only compatibility, migrate history, retire after acceptance. |
| Standards evaluations/corrective actions | Requirement gaps and work bridge | Good schema, deterministic pure rules, task link | Rules have no production caller; zero live corrective actions | Keep; add orchestrator and approval transaction. |
| Work orders, inspections, meetings, reports, concerns | Domain records | Domain-specific context | Actions/follow-ups are free text or separate checklists | Keep domain records; generate/link canonical tasks and corrective actions. |

## Capability analysis

### Requirement-to-task generation

Partial schema, no operating pipeline. `program_standards` can link to `standard_corrective_actions`, and corrective actions can link to `tasks`. `src/lib/standards/rules.ts` produces traceable proposals. No route, hook, script, cron, or Edge Function calls those rules in production. Seed evaluations are snapshots, not continuous evaluation.

Required: a deterministic evaluator job that writes append-only evaluations and idempotent proposed actions; a manager approval command must create/link the task atomically. An AI must never move a standard state or create mandatory work without the deterministic proposal and human approval required by that rule.

### Recurring task generation

Duty series generation is the strongest part. `materialize_duty_occurrences` uses series/occurrence identity and the corrective migration protects moved/protected history. `extend_task_series` has cron support. My Day recurrence is client-driven and skips missed periods to the next current deadline. Obligations calculate occurrences client-side but store only completion keys.

Required: one server-side recurrence service for authoritative occurrences. Personal planning may derive from it but must not generate authoritative work in the browser.

### Deadline calculations

Available cadences are fragmented:

- duties: daily/weekly/monthly/quarterly/annual recurrence rules and seasons;
- obligations: weekly/monthly/quarterly/annual with lead days;
- My Day: daily/weekly/monthly/quarterly/yearly deadlines with buffer days;
- schedule board: its own recurrence fields;
- calendar: dates, not execution deadlines.

Missing rule types: business-day adjustment, pay-period boundary, backward-staged milestones, relative-to-event, seasonal window with approval, certification renewal windows, inspection-result follow-up, conditional thresholds, dependency-relative dates, blackout/operating hours, and locally configured holidays/time zones.

### Pay-period logic

`src/lib/operations/engine.ts` correctly keys Sun-Sat weeks by their Sunday and tests DST/year-boundary-safe local dates. The `kronos-timecards` seed is due Monday. It does not model the pay period, its employees, exception types, correction state, unresolved escalation, readiness approval, or evidence. The AI assistant's duplicated period helper did not support weekly keys before this audit's remediation slice.

### Seasonal tasks

Duty seasons are a simple `in_season`/`year_round` flag with a hard-coded March 20-October 15 window in `src/lib/operations/engine.ts`; Phase 1A recurrence versions can carry explicit seasonal MM-DD dates. Annual obligations cover several course events. There is no approved seasonal plan, target-date project, weather/local adjustment, dependency, or versioned rationale.

### Event-triggered and conditional tasks

The application records equipment triage, course observations, AST failures, environmental severities, certification expiry, financial flags, PR stages, weather, and complaints/concerns. Most do not generate canonical work. The standard rules demonstrate the correct proposal pattern but are not executed.

Required: `trigger_rule` + `trigger_evaluation` + idempotent proposal. High-stakes records require an authorized human to activate work; deterministic mandatory rules may activate only when their verified requirement explicitly authorizes it.

### Dependencies

`tasks.parent_task_id` is a loose parent reference. There is no typed finish-to-start/blocking relationship, dependency status, critical path, or dependency-based due calculation. Projects, events, meetings, reports, and workflows therefore cannot be reliably staged.

### Priority calculation

Legacy tasks use manual `critical/high/normal/low`; My Day uses `urgent`; obligations sort by overdue/due date; Today places feeds in a fixed render order. There is no canonical score incorporating source authority, safety/compliance/financial impact, deadline, missed count, blocked downstream work, customer impact, asset criticality, event proximity, or effort/capacity.

Proposed deterministic ordering:

1. hard stop / immediate safety, environmental, payroll, financial, or operational risk;
2. verified mandatory deadline and overdue age;
3. blocked downstream critical work or event opening;
4. required approval/verification;
5. customer/revenue/asset criticality;
6. due-soon age and escalation stage;
7. capacity/route grouping and estimated effort;
8. AI recommendation score, clearly labeled and never able to outrank a mandatory hard stop by itself.

### Workload balancing

Estimated minutes exist on rich tasks/duties, but live duty metadata and staff availability are incomplete. Today does not compare workload with shifts, operating hours, leave, skills, department, or location. No assignment optimizer should be built until profiles, shifts, duration, skills, and approval boundaries are reliable.

### Delegation and temporary coverage

Phase 1A provides strong temporal primary/backup/contractor ownership, previewed bulk reassignment, coverage ranges, and history-preserving recurrence changes. Live temporary coverage/history counts are zero and all generated occurrences are unassigned. The capability exists but has not been operationally adopted.

### Evidence and verification

Duty-backed tasks can enforce structured evidence and independent manager verification. The `guard_task_mutation` trigger forces actor/timestamps and protects completed facts. Other work sources use descriptive arrays, photos, notes, or checkboxes without DB enforcement. Live task evidence is zero, and no task is verified.

Required: every canonical occurrence snapshots its evidence and verification contract from the effective definition/version. Independent verification rules must reject `verified_by = completed_by` when the requirement demands independence.

### Escalation and missed-task handling

Obligations keep the oldest missed period visible; certifications and equipment can surface alarms. There is no escalation state, event log, notification stage, manager acknowledgment, corrective action, or consequence model. Repeated misses do not change the plan or create review work.

### Notifications

Notification/push infrastructure exists, but live `notifications` is empty and transitions across modules do not consistently publish events. A transactional outbox is needed so a successful task mutation and its notification event cannot diverge.

### History and reporting

Duty assignments/recurrence/audit/task history are designed well. My Day steps remain lightweight owner-controlled records; obligation completions are now immutable and corrected through an audited RPC. Calendar remains broad CRUD. Repository migrations `20260716150000_staff_privacy_security.sql` and `20260716170000_profiles_personnel_privacy.sql` protect private staff history and separate personnel facts from the directory locally, but neither is deployed and many other tables lack event history. Reporting reads current states and often cannot reconstruct prior-period state. Work-order and equipment briefing code explicitly reports insufficient history.

### AI recommendations and human approval

The repository already follows “deterministic math, AI narrative” in financial and briefing engines and “proposal, not write” in standards rules. That boundary should become universal:

- deterministic verified rule: may calculate due work;
- local approved template: may generate work within its approval/version;
- AI: summarize, rank, group, detect risk, draft a proposal;
- human: approve new high-impact workflow/template/assignment/frequency and all financial/HR/safety/environmental/compliance record changes not explicitly authorized by a verified deterministic rule.

### Duplicate prevention

Strong on duty occurrence keys, My Day series deadlines, source-ref quick steps, and open standard-corrective-action index. Weak across modules: the same inspection failure or commitment can become a My Day step, task, work order, concern, and note. Canonical `source_type + source_id + trigger_rule_version + occurrence_key` uniqueness is required.

### Offline and mobile usability

The app has PWA/Capacitor foundations, direct REST helpers, an offline queue, background sync utilities, camera support, and responsive components. Critical task/evidence/verification mutations are not proven in offline conflict/replay tests. Server-authoritative transitions should queue commands with idempotency keys, never optimistic raw row patches for protected facts.

### Security

Individual sessions, duty-backed task RLS, creator-scoped My Day rows, and the audited obligation command are real. The rest of the work system is not consistently identity-aware. Broad all-authenticated policies remain on calendar, certification, schedule, inventory, onboarding, financial, and other modules. Private staff/one-on-one policies are corrected in the repository with a manager/direct-supervisor matrix, forced actors, and history guards, but remain a release item until staged and deployed. Client RoleGuard is a query-mount/usability guard, never the authority. Security must be completed before connecting sensitive data to a unified command center.

## Proposed canonical architecture

```text
Authority/source
  -> standard / local requirement (versioned, classified, approved)
      -> workflow template version (steps, deadline rule, evidence, verification, escalation)
          -> responsibility assignment (role/person/backup/coverage, effective dates)
              -> workflow run (pay period, month, event, inspection, project)
                  -> task occurrence(s) in canonical tasks
                      -> evidence -> completion -> verification -> closure
                          -> audit events + notification outbox + reports/briefing

Operational source event
  -> deterministic trigger evaluation
      -> proposed corrective action (idempotent)
          -> authorized approval
              -> same canonical task occurrence path
```

### Canonical command boundaries

1. `save_requirement_version(...)`: manager/source-owner only; validates source classification and reason.
2. `approve_workflow_template_version(...)`: freezes deadline/evidence/verification/escalation contract.
3. `generate_workflow_run(...)`: service role or explicit manager command; idempotent occurrence key.
4. `assign_work(...)` / `set_temporary_coverage(...)`: effective-dated, audited, no historical rewrite.
5. `transition_task_status(...)`: actor forced, evidence checked, legal transition enforced.
6. `record_task_evidence(...)`: typed requirement key, actor/time, parent permission.
7. `verify_task(...)`: independent verifier when configured; no self-verification.
8. `record_trigger_evaluation(...)`: stores deterministic input snapshot/version and proposal.
9. `approve_corrective_action(...)`: atomically creates/links one task.
10. `publish_domain_event(...)`: transactional outbox for notifications, briefing, and audit consumers.

## Manager command-center contract

The future Today query should return a single normalized projection, not ask the UI to merge unrelated tables. Every item must include:

- canonical item/run/occurrence ID and type;
- mandatory/local/recommended/AI classification;
- source requirement/version and plain-language reason;
- owner, backup, department, current coverage, and assignment confidence;
- due instant/local date, deadline rule, escalation stage, and missed count;
- priority inputs and final deterministic rank;
- status, blockers, dependencies, next legal action;
- evidence/verification requirements and satisfaction state;
- approval/verification actor needed;
- estimated duration, location, operating window, skills/equipment;
- related asset/event/report/meeting/person/project;
- history and last material event;
- data-quality state (`recorded`, `missing`, `insufficient`, `stale`, `unverified`).

Employee My Day should be a filtered presentation of the same projection plus explicitly personal planning steps. A personal checkbox must never masquerade as completion of authoritative work.

## Required template behavior

The five initial templates are specified in `docs/operating-vision-traceability-matrix.md`. They must be versioned, labeled local/draft, and inactive until an authorized owner confirms the deadline, applicability, roles, evidence, and escalation. The system must create bounded workflow runs rather than hundreds of undifferentiated asset tasks.

## Acceptance gates for a real operational boss

The task system is not mature until all are true:

1. One source of truth for authoritative work and occurrence identity.
2. Every mandatory item has a verified/local-approved source and effective version.
3. Every occurrence has an owner or is prominently escalated as an ownership gap.
4. Completion always records actor/time and enforces evidence.
5. Independent verification is enforced where configured.
6. Missed work advances through explicit escalation and corrective handling.
7. Requirements/template edits never rewrite historical occurrences.
8. Duplicate generation is prevented under concurrency and retry.
9. Employee departure/coverage preserve history and future accountability.
10. Today and My Day are two views of one canonical projection.
11. Reports/briefings consume the same event/history model.
12. RLS tests prove least privilege for worker, backup, foreman, manager, HR/private, financial, and service roles.
13. Time-zone, DST, month-end, fiscal-year, pay-period, seasonal, and scale tests pass.
14. Missing/empty data is labeled, never rendered as confident readiness.
15. AI recommendations are distinguishable, reviewable, and unable to mutate high-stakes facts without authorization.
