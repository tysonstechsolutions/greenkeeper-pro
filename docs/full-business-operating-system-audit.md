# Greenkeeper Pro full business operating-system audit

- Audit date: 2026-07-16 (America/Chicago)
- Repository baseline: `main` at `e131d05cb045ccf7c98e95967bb8f862e30dc145`
- Live evidence window: 2026-07-16 CDT / UTC

## Executive summary

Greenkeeper Pro is a broad, useful collection of golf-facility tools with several genuinely strong subsystems. It is not yet a dependable business operating system. The best execution path - duty-backed `tasks` - has database-enforced ownership history, recurrence identity, evidence checks, verification, and protected completed history. Procurement, equipment/assets, pro-shop scheduling, deterministic financial analysis, PDF/form generation, and the leadership briefing are also substantive.

The operating-system claim fails at the connection layer. Requirements, standards, obligations, My Day checkboxes, schedule-board items, legacy tasks, inspections, meetings, reports, incidents, and corrective actions do not converge on one lifecycle. Today composes several feeds but does not calculate one risk-ranked plan. Standards have a database model and pure proposal rules, but no application/background caller runs those rules. The live database contains 649 generated duty tasks, yet every one is pending and unassigned; there are no task evidence records, verified tasks, temporary coverages, recurrence-history events, or duty audit events. That is a generated backlog, not an operating rhythm.

The application should be treated as production-usable only for selected bounded tools whose users understand their limits. It is not production-ready as the authoritative daily control system for a Navy MWR golf facility.

| Executive verdict | Finding |
|---|---|
| Strongest area | Procurement (58/100): purchase requests, vendors, audit/reconciliation, receipts, forms, and supporting documents form the deepest bounded workflow. |
| Weakest area | Marketing (5/100): one management rhythm exists, but campaigns, approvals, assets, channels, publication, metrics, and follow-up are not modeled. |
| Most dangerous false impression | 649 generated duty rows can look like an operating rhythm even though every row is pending and unassigned and none has evidence, completion, verification, coverage, or audit activity. |
| Most important next step | Validate both repository-only people-security migrations in staging, then implement Phase 0B.5 calendar/certification/onboarding/schedule authorization before running a small assigned/evidenced duty pilot. |

## Maturity score

Overall maturity: **29 / 100**.

The score measures reliable end-to-end operation, not route, component, or table count. A polished page with no ownership, secure mutation, evidence, escalation, or historical closure receives little credit.

| Area | Score | Evidence-based assessment |
|---|---:|---|
| General management | 32 | Today and workspace hubs provide orientation, but the GM still has to reconcile disconnected feeds and remember missing workflows. |
| Task operating system | 30 | Duty occurrences are technically strong; requirements, obligations, My Day, inspections, meetings, reports, and follow-ups do not share that lifecycle. |
| Course maintenance | 48 | Course maps, observations, irrigation, watering, duties, weather, and reporting are broad; agronomic plans and exception-triggered work remain fragmented. |
| Restaurant | 12 | Inventory/purchases/duty-log surfaces exist, but live inventory and purchase data are empty and there is no opening/closing, temperature, food-safety, waste, or cash-control workflow. |
| Pro shop and golf operations | 35 | Scheduler has real data (310 shifts), but retail inventory, margin, tee-sheet readiness, carts/range, refunds, league execution, and closing controls are incomplete. |
| Staffing and scheduling | 35 | Profiles and a strong pro-shop scheduler exist; facility-wide schedule publication, history, conflict/labor review, and employee notification are not one controlled workflow. |
| Payroll readiness | 12 | A weekly Kronos obligation exists, but it is a single reminder, not a Sun-Sat pay-period close with employee exceptions, corrections, evidence, and escalation. |
| Financial management | 38 | Budget and deterministic financial-watch logic are useful; live revenue is thin and expenses, cost-center budgets, projects, targets, forecasts, COGS, and inventory value are absent/empty. |
| Procurement | 58 | Strongest business workflow: PRs, vendors, quote/tax checks, approvals, receipts/reconciliation, SOW/sole-source, audit, and official forms. It still lacks a canonical task/approval queue and complete audit trail. |
| Equipment and assets | 55 | Strong records and service history; PM generation, inspection cadence, evidence completeness, cost/hour, replacement planning, and photo collection are not operationalized. |
| Compliance and standards | 36 | Ninety-three standards/evaluations and 28 obligations exist; evaluations are seeded snapshots and rule proposals have no writer/orchestrator. Policy-source metadata is incomplete. |
| Environmental management | 28 | Twelve AST inspections and environmental/checklist schemas exist; corrective-action generation, asset-specific inspection schedules, evidence, verification, and validated local rules are incomplete. |
| Safety and incidents | 10 | Safety appears in generic tasks, inspections, SOP text, and issue records; there is no authoritative hazard/incident/near-miss/injury investigation and closure model. |
| Training and certifications | 18 | Certification expiry evaluation exists, but live data has one certification and no position-requirement matrix, renewal workflow, evidence verification, or training history. |
| Marketing | 5 | A monthly obligation and prose exist; no campaigns, channels, assets, approvals, publication records, or performance data are modeled. |
| Leagues and events | 12 | Calendar/tournament pages and checklist tables exist, but live events are empty and the commercial/operational lifecycle is not modeled. |
| Reporting | 42 | Many deterministic/PDF reports exist; required-report definitions, preparation tasks, source completeness, review/submission, retention, and overdue escalation do not. |
| Leadership briefing | 48 | Deterministic, provenance-aware, explicit-approval briefing is strong. It reports available facts but is not fed by a complete operational system or retained submission workflow. |
| Security and permissions | 38 | Individual PIN sessions, anonymous lockdown, task RLS, and the live audited obligation command are real improvements. Staff-record and personnel-directory corrections are locally proven but not deployed; calendar, certification, inventory, and financial paths still lack least privilege. |
| Data readiness | 30 | Equipment, assets, shifts, standards, PRs, vendors, and budget lines are populated; most operational, HR, F&B, events, evidence, inspection, incident, and financial-history tables are empty or thin. |

## Audit method and evidence boundary

- Inspected 122 application page routes, the 125 baseline migrations, 102 baseline Vitest files, navigation, hooks, Edge Functions, recurrence engines, storage/security migrations, and recent audit/runbook documents. The two repository-only people-security slices bring the repository to 127 migrations and 104 Vitest files.
- Ran the Playwright route inventory across 89 routes at desktop and mobile widths: all 178 probes rendered and produced screenshots, with no page exceptions, failed network-request captures, or horizontal scroll. The audit still recorded console errors on 62 route/viewport probes and four fixed-element positioning findings. Common signals were 404/400/406 responses on absent or placeholder-backed paths, unsupported camera access in the test browser, and a render-time state update warning on briefing settings. These are triage evidence, not proof of 62 distinct production defects.
- Traced task creation/completion paths through `src/lib/hooks/useTasks.ts`, `src/lib/my-day/use-my-day.ts`, `src/lib/operations/use-operations.ts`, `src/lib/operations/use-duty-management.ts`, `src/lib/standards/*`, and the corresponding migrations.
- Reused the 2026-07-15 anonymous-posture evidence recorded by the prior audit; the write-denial probe was not repeated because this session made no production writes.
- Ran `node scripts/audit-data-readiness.mjs`: exact counts and filtered counts only; no row values were printed.
- Five optional filtered counts for evidence/verification requirement-state columns returned non-diagnostic `{ "message": "" }` API errors. They were not used to classify those fields; table-level evidence counts and repository schema were still available. The live presence of `obligation_completion_audit_events` with four rows confirms that the command-center migration is deployed; this does not prove every caller or role path.
- Opened the deployed `/today/` route read-only. It stopped at the individual PIN screen. No stored PIN was entered, so signed-in interactive flows were not re-exercised. Live schema/data presence was verified through authenticated count-only REST calls.
- Did not claim Navy/CNIC authority for a requirement unless the repository records a source. Seeded management rhythms remain local standards or drafts needing confirmation.

## What works today

### Identity and the canonical duty execution path

- Operational routes require an individual Supabase session through `src/components/auth/auth-gate.tsx`; `src/app/layout.tsx` no longer mounts the retired shared `LockGate`.
- `supabase/functions/pin-login/index.ts` establishes an individual account session rather than silently impersonating a manager.
- `supabase/migrations/20260713230000_daily_operations_phase1a_corrective.sql` provides atomic duty save/reassignment/coverage/recurrence RPCs, immutable occurrence identity, task evidence checks, forced actor attribution, manager verification, protected completed/verified facts, and least-privilege `tasks` RLS.
- `/operations/duties` uses those RPCs through `src/lib/operations/use-duty-management.ts`; the legacy `/pro-shop-schedule/duties` route is intended to redirect rather than remain a competing writer.

### Deterministic operational logic

- `src/lib/operations/engine.ts` keeps missed obligations visible oldest-first and handles weekly Sun-Sat period keys without ISO-week ambiguity.
- `src/lib/my-day/recurrence.ts` is end-of-month aware and has duplicate prevention through `(series_id, deadline)`.
- `src/lib/financial-watch/engine.ts`, `src/lib/money/area-pnl.ts`, PR audit/reconciliation helpers, equipment readiness helpers, and `src/lib/briefing/engine.ts` compute deterministically; AI is used for narrative/recommendation rather than authoritative math.

### Strong domain tools

- Procurement: `/purchase-requests`, `/pr-audit`, `/vendors`, `/sow`, `/sole-source`, DD-200/2212, receipt reconciliation, tax rejection, Section 889, and PR stage tracking.
- Equipment/assets: `/equipment`, `/assets`, service/part records, triage/readiness helpers, scanning, disposition packets, and asset reports.
- Pro-shop schedule: `/pro-shop-schedule` with staff, schedules, 310 live shifts, duty/warning logic, handouts, and coverage views.
- Leadership briefing: `/reports/briefing`, provenance/availability states, explicit GM approval before saving/export, and deterministic source handling (`src/lib/briefing/*`).
- Forms/reports: extensive generators in `src/lib/reports/` with unit tests.

## What appears to work but does not complete the workflow

| Surface | False impression | Missing end-to-end behavior |
|---|---|---|
| Today (`/today`) | One authoritative daily plan | It concatenates standards, obligations, equipment, duties, My Day, and calendar slices. It does not normalize dependencies, approvals, verification, workload, escalation, or risk into one queue. |
| My Day (`/my-day`) | Canonical personal task list | `daily_steps` are lightweight checkboxes without standard, why, owner transfer, evidence, verification, blocker, duration, escalation, or protected history. |
| Program Standards (`/standards`) | Live standards engine | `src/lib/standards/rules.ts` returns deterministic proposals, but repository search finds callers only in tests. No job/app path writes rule results. |
| 93 evaluations | Current operational assessment | Live count equals the seed set; `scripts/seed-program-standards.mjs` created initial evaluations. There are zero corrective actions and zero version records. |
| 649 tasks | Active delegated operating rhythm | All 649 are duty-backed, pending, and unassigned; zero are completed or verified. No evidence or duty audit history exists. |
| Kronos obligation | Payroll close workflow | One Monday reminder cannot track each employee, exception types, corrections, unresolved cases, readiness approval, or evidence. |
| Monthly schedule obligation | Schedule-publication workflow | One month-end obligation does not stage demand review, availability, draft, labor/budget checks, conflict resolution, approval, publication, notification, or late changes. |
| Calendar | Meeting management | Events and scheduled 1:1 rows exist, but agenda, preparation, decisions, actions, follow-ups, approval, and preserved minutes are not a meeting lifecycle. |
| Certifications | Training compliance | Expiry alarms exist, but one live row and no requirement-by-position model make compliance coverage unknowable. |
| Environmental | Inspection/correction system | AST forms can record observations; failures do not generate canonical corrective work with evidence and verified closure. |
| Reports | Submission management | Reports can be rendered, but the app does not define the recurring report catalog or retain draft/review/approval/submission state and submitted versions. |
| Restaurant/pro-shop inventory | Inventory control | Pages and tables exist, but live inventory tables are empty; there is no cost, par, reorder, valuation, waste, margin, or audit workflow. |

## Missing capabilities

Entirely missing or not yet modeled as trustworthy workflows:

- canonical requirement/deadline/workflow-template engine;
- staged monthly schedule publication and Sun-Sat payroll close;
- facility-wide employee availability, labor budget, publication, and notification history;
- safety hazards, near misses, patron/employee incidents, investigations, notifications, and verified corrective closure;
- required training/certification matrix by position and authority;
- report catalog, report runs, approvals, submissions, retained versions, and deadlines;
- meeting agendas, decisions, minutes, action ownership, and follow-through;
- marketing campaigns and performance;
- hiring pipeline, candidate stages, approvals, and 30/60/90-day onboarding reviews;
- complete league/tournament/outing lifecycle and financial closeout;
- restaurant opening/closing, temperatures, receiving/storage/rotation, waste, food-safety corrections, cash/deposit control, and equipment sanitation;
- pro-shop opening/closing, tee-sheet/range/cart readiness, refunds/incidents, retail SKUs, margin, replenishment, and displays;
- customer complaint/commitment/communication follow-up;
- asset photo completeness types, batched collection work, duplicate prevention, and verification;
- PM/inspection rule generation, meter triggers, parts dependencies, cost/hour, and replacement planning;
- operational escalation, missed-task follow-ups, workload/capacity, and notification delivery;
- authoritative retention policy and tested backup/restore.

## Duplicate or conflicting systems

1. `tasks` / `task_templates` / `task_series` versus `daily_goals` / `daily_steps` versus `obligations` / `obligation_completions` versus schedule-board items. Each can represent work; only duty-backed `tasks` has the required execution controls.
2. `operation_duties` versus legacy `pro_shop_duties` and `duty_completions`. The corrective migration retires direct legacy duty writes, but compatibility data/routes still exist.
3. Today and My Day. Today embeds My Day plus duties/obligations; My Day separately loads duty tasks. They share a screen, not a normalized work contract.
4. Static `/standards-plan` data (`public/data/standards_plan.json`) versus DB-backed `/standards` (`program_standards`). The static assessment remains a second presentation/source.
5. `staff_one_on_ones` (scheduled calendar event) versus `staff_one_on_one_sessions` (structured session) plus `staff_records` and `staff_concerns` for follow-ups.
6. `equipment` versus `fy26_assets`. The operational fleet and accountable-property registry are related but incomplete/duplicated; 211 assets and 117 equipment units require an explicit linking and source-of-truth policy.
7. Generic `schedules` versus pro-shop schedules/shifts and the course schedule board. Facility-wide publication has no canonical schedule aggregate.
8. Generated reports versus approved leadership briefing documents versus `created_documents`; there is no common report-run/submission record.

## Security blockers

- Post-April migrations reintroduced `FOR ALL TO authenticated USING (true) WITH CHECK (true)` on My Day, calendar, staff records/concerns, one-on-one sessions/engagement profiles, pro-shop scheduling, certifications, inventory, onboarding documents, and other modules.
- `20260716010000_command_center_security.sql` is live and closes the former obligation/My Day write boundary, but the canonical work model is still fragmented and one of 28 obligations remains unowned.
- Sensitive one-on-one notes, engagement profiles, staff concerns, HR records, and document metadata are still broad in the deployed schema. Repository migration `20260716150000_staff_privacy_security.sql` corrects those policies, actor fields, history protection, and bucket access locally, but it is not applied or deployed.
- Deployed `profiles` still combines an operational directory with hire dates, emergency contacts, legacy certification/license JSON, and SF-52 employment/pay details. Repository migration `20260716170000_profiles_personnel_privacy.sql` copies and verifies those exact values into `staff_personnel_private`, removes the four source columns without `CASCADE`, adds the narrow `staff_directory` view, and prevents employee self-promotion. It is locally proven and not deployed.
- Financial and inventory domains lack consistent department/manager least privilege; browser RoleGuard coverage is not a database control.
- Ten of 19 live profiles have no department, preventing dependable department-scoped authorization or workload routing.
- Storage hardening is uneven. `staff-documents` is non-public but its deployed object SELECT policy still permits any authenticated account; the new repository migration narrows it to active managers. General photos, retention, and every other bucket still need bucket-by-bucket verification.
- `activity_log` exists but general application writes do not provide a complete audit trail. Duty/standard-specific audit structures are better but unused in live data.

## Data blockers

Live count-only evidence:

- Reliable/populated: 117 equipment units, 211 FY26 assets, 51 equipment service records, 23 purchase requests, 22 vendors, 94 budget items, 14 work orders, 9 pro-shop staff, 2 pro-shop schedules, 310 shifts, 93 standards/evaluations, 28 obligations, 15 duties/assignments.
- Populated but operationally inactive: 649 duty-backed tasks, all pending and unassigned; 93 evaluations with zero corrective actions; 15 assignments with no executed occurrence; one obligation has no owner.
- Thin: 9 revenue entries, 12 AST inspections, 2 obligation completions with 4 append-only audit events, 1 certification, 1 inspection checklist, 1 equipment log, and 1 created document. Live My Day goals/steps are now empty.
- Empty: task evidence, task completed/verified states, duty audit/history/coverage, standard versions/corrective actions, calendar events, one-on-ones, staff concerns/records/documents, schedules/time off, equipment inspections, environmental compliance, water use, chemicals/applications, cost-center budgets, expenses, capital projects, F&B inventory/counts/purchases, tournaments/checklists, notifications, and generic photos.
- Missing completeness: all 117 equipment rows lack `photo_url` and `last_inspection_date`; all 211 FY26 assets lack `photo_url`; 6 equipment serials are missing; 94 assets remain unverified; 10 profiles lack department.

These counts prove readiness only at the table level. They do not validate accuracy, freshness, business approval, or source authority.

## User-experience blockers

- Today silently caps My Day at eight items and equipment attention at six (`src/app/today/page.tsx`), with no workload total or explicit omitted-item warning.
- Prioritization is feed order plus per-feed sorting, not one risk/dependency/capacity score.
- Unassigned work is structurally possible and live at scale; it is not presented as a GM ownership emergency.
- Actions can appear available in client UI even when server roles reject them; client/server role sets have historically differed.
- My Day completion is a checkbox with optimistic update and no evidence/verification semantics.
- Empty, thin, or not-recorded data can sit behind polished pages without a prominent readiness banner.
- Mobile foundations are strong (PWA/Capacitor/offline utilities), but critical cross-module workflows lack offline conflict and replay tests.
- E2E coverage inventories routes rather than exercising the critical operating lifecycles. Its 178 rendered probes coexist with 62 console-error findings and four positioning findings, so the suite must not be presented as business-flow acceptance.

## Compliance and policy-source limitations

- `program_standards.source_type` and source-document fields are a good foundation, but the live catalog must be revalidated against authoritative current documents before it is treated as a mandate library.
- `20260715170000_gm_operating_rhythm.sql` correctly labels its entries as management-defined and calls out unconfirmed MWR/CNIC reporting and payroll details. Those are drafts/local standards, not verified Navy requirements.
- Exact environmental tank checklists, food-safety rules, HR/payroll cutoffs, financial retention, incident notification, and CNIC/MWR reporting requirements are not authoritatively established in the repository.
- Future labels must use: Verified requirement; Local management standard; Recommended best practice; Draft requirement needing confirmation; Not applicable; Retired or superseded requirement.
- AI may summarize and recommend, but only deterministic approved rules should generate mandatory deadlines; no AI output may silently change official frequency, financial/HR/safety/environmental/compliance records, or source classification.

## Production-readiness verdict

**Not production-ready as the complete operating system or authoritative daily command center.**

Safe limited-use verdict: selected tools can remain in bounded operational use (procurement/forms, equipment records, pro-shop shifts, deterministic reports) with trained users and existing backups/controls. Do not rely on Today/My Day/standards/obligations as proof that all required work was assigned, performed, evidenced, verified, escalated, or retained.

Release blockers before expanding features:

1. identity-aware least-privilege RLS and actor-attributed, audited mutations for every work/private/financial domain;
2. migration-state evidence and repeatable preview/staging or disposable integration testing;
3. canonical work/requirement model and migration plan for competing work sources;
4. real owner/data cleanup for the current 649 unassigned occurrences, the unowned obligation, and profile departments;
5. requirement/source validation and configurable workflow templates;
6. critical end-to-end, RLS, recurrence, evidence, verification, history, scale, and mobile tests;
7. tested backup/restore and retention procedures.

## Repository remediation status

The prior `20260716010000_command_center_security.sql` slice is now live: two
active obligation completions and four append-only audit events are visible to
the count-only audit. That is a meaningful correction, but it does not connect
the competing work systems or assign the 649 duty occurrences.

This session adds `20260716150000_staff_privacy_security.sql`. It replaces broad
policies across scheduled 1:1s, concerns, structured sessions, engagement
profiles, HR records, employee-document metadata, and the matching storage
objects. It authorizes active managers and recorded direct supervisors only
where appropriate, keeps HR/pay/document data manager-only, derives actors from
`auth.uid()`, prevents employee reassignment and completed/history deletion, and
guards the full profile and cross-employee insights pages before their queries
mount. The complete migration replay and a transactional multi-role RLS matrix
pass locally. This migration is repository-only: it was not applied or deployed.

The follow-on `20260716170000_profiles_personnel_privacy.sql` slice implements
Phase 0B.4 locally. It separates hire dates, emergency contacts, legacy
certification JSON, and SF-52 personnel details from `profiles`; preserves exact
source values before dropping the old columns; gives employees self-read and
active managers maintenance access; publishes a safe directory view; blocks
crafted self-service role/department/supervisor changes; and routes admin edits
through one allowlisted atomic command. Historical replay, schema lint, the new
transactional role matrix, and both prior security matrices pass. It was not
applied or deployed.

## Evidence index

| Conclusion | Primary repository evidence |
|---|---|
| Individual operational identity | `src/app/layout.tsx`; `src/components/auth/auth-gate.tsx`; `src/lib/providers/auth-provider.tsx`; `supabase/functions/pin-login/index.ts`; `src/__tests__/components/auth/individual-auth.test.tsx` |
| Canonical duty execution strength | `supabase/migrations/20260713230000_daily_operations_phase1a_corrective.sql`; `src/lib/operations/use-duty-management.ts`; `src/lib/hooks/useTasks.ts`; `src/__tests__/unit/operations/daily-operations-migration.test.ts` |
| Today is a feed composition | `/today`; `src/app/today/page.tsx`; `src/lib/operations/use-operations.ts`; `src/lib/my-day/use-my-day.ts`; `src/lib/calendar/use-calendar.ts` |
| My Day is a lightweight parallel system | `supabase/migrations/20260630_my_day.sql`; `20260701_my_day_recurrence.sql`; `src/lib/my-day/*`; `/my-day` |
| Standards rules are not orchestrated | `src/lib/standards/rules.ts`; `src/lib/standards/use-standards.ts`; `src/__tests__/standards/rules.test.ts`; `scripts/seed-program-standards.mjs` |
| Obligation write security gap | `supabase/migrations/20260702_operating_rhythm.sql`; pre-remediation `src/lib/operations/use-operations.ts`; `supabase/functions/ai-assistant/index.ts` |
| Obligation/My Day live remediation | `supabase/migrations/20260716010000_command_center_security.sql`; `supabase/tests/command_center_security.sql`; `scripts/test-command-center-security-local.mjs`; `src/__tests__/unit/operations/command-center-security.test.ts`; live count-only audit |
| Private-staff and personnel-directory remediation | `supabase/migrations/20260716150000_staff_privacy_security.sql`; `supabase/migrations/20260716170000_profiles_personnel_privacy.sql`; `supabase/tests/staff_privacy_security.sql`; `supabase/tests/personnel_privacy_security.sql`; corresponding local runners and Vitest contracts |
| Remaining certification authorization gap | `supabase/migrations/20260703_certifications.sql`; `supabase/functions/ai-assistant/index.ts`; Phase 0B.5 plan |
| Procurement depth | `/purchase-requests`; `/pr-audit`; `/vendors`; `src/lib/pr-*`; `src/lib/quote/*`; `src/lib/reports/pr-*`; `20260502_purchase_requests.sql`; `20260608_pr_audit*.sql` |
| Equipment/assets depth and gaps | `/equipment`; `/assets`; `src/lib/equipment/*`; `src/lib/hooks/useEquipment.ts`; `useFy26Assets.ts`; equipment/asset migrations |
| Leadership briefing | `/reports/briefing`; `src/lib/briefing/*`; `src/components/briefing/leadership-briefing-review.tsx`; briefing tests |
| Live data readiness and anon posture | `scripts/audit-data-readiness.mjs`; `scripts/security/anon-probe.mjs`; live count-only outputs recorded during this audit |
