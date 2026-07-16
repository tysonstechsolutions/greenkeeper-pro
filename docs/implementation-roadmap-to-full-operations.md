# Implementation roadmap to full operations

## Sequencing rules

- Correct security, actor attribution, history, backups, and source-of-truth decisions before connecting more sensitive modules.
- Deliver vertical, testable workflows; do not add pages without creation -> assignment -> execution -> evidence -> verification -> escalation -> reporting.
- Use preview/staging or disposable local integration databases. The production project is never a test fixture.
- Preserve current IDs/history and use compatibility views/dual-read evidence before retiring writers.
- Treat official requirements as unverified until an authoritative source owner confirms applicability.

## Phase 0 - Security, identity, RLS, auditability, and source-of-truth corrections

**Objective:** make current data trustworthy enough to unify.

- Dependencies: current individual PIN identity; migration ledger/target evidence; backup capability.
- Database: inventory all grants/policies/functions/buckets; owner/private/department/manager RLS; actor-attributed RPCs; protected-history triggers; append-only audit events; transactional outbox; source-of-truth mappings for tasks/duties/My Day/obligations, equipment/assets, meetings, schedules, standards.
- Backend: replace raw protected table writes with commands; narrow Edge Function clients; idempotency keys; schema-readiness checks.
- UI: permission-aware actions; explicit unavailable/insufficient states; ownership-gap and data-readiness banners; correction-reason flows.
- Migration: additive policies/functions first; count-only before/after evidence; no mass backfill without reviewed mapping; compatibility path for current users.
- Security: manager/private HR, financial, incident, evidence, storage, and department tests; eliminate post-hardening `USING(true) WITH CHECK(true)` drift where inappropriate.
- Testing: SQL/RLS role matrix, actor forgery, protected history, storage, anonymous probe, Edge Function auth, concurrency/idempotency, full suite.
- Data collection: fill 10 missing departments; identify real role/access owners; classify buckets/tables; document accepted exceptions.
- Acceptance: anonymous denied; unrelated employees denied; every protected mutation forces actor/time; sensitive notes/private files restricted; restore drill succeeds; drift evidence recorded.
- Risks: breaking currently permissive UI, orphan/null actor rows, no staging, irreversible production assumptions.
- Complexity: **extra-large**.

Phase 0 status on 2026-07-16:

- Live: individual identity, anonymous lockdown, duty/task commands, creator-scoped My Day rows, and audited obligation completion/correction.
- Implemented and locally verified, not deployed: private staff/1:1/HR/document RLS, forced actors, history protection, manager-only staff-document storage, and pre-query admin guards (`20260716150000_staff_privacy_security.sql`); exact private-personnel extraction, safe directory view, self-promotion guard, and atomic admin profile command (`20260716170000_profiles_personnel_privacy.sql`).
- Still blocking completion: calendar, certification, onboarding, pro-shop scheduling, inventory, financial, incident, and remaining storage policies; general audit/outbox; ten missing departments; backup/restore and staging evidence.
- Acceptance is **not met**. Phase 1 must not begin as a broad production consolidation until these remaining boundaries have explicit dispositions and role tests.

## Phase 1 - Canonical task and requirement engine

**Objective:** one authoritative lifecycle for mandatory/local-approved work.

- Dependencies: Phase 0 identity/RLS/audit; confirmed source classifications; table disposition decisions.
- Database: requirement/version, workflow template/version/steps, deadline/trigger/escalation rules, responsibility assignment/coverage, workflow runs, task source/generation fields, dependencies, approvals/verifications, trigger evaluations, corrective links.
- Backend: deterministic deadline engine; server-side generation; idempotent proposal/approval/task commands; standard-rule orchestrator; outbox events; missed-work escalation.
- UI: requirement library, template version editor/review, proposed-action queue, owner/backup/coverage, source/reason/evidence panels.
- Migration: map `program_standards`, `operation_duties`, `task_templates`, obligations, and selected schedule series; preserve legacy views and occurrence IDs.
- Security: requirement/template changes manager/source-owner only; employees see only applicable work/source excerpt; service generator narrow execute.
- Testing: date/time/DST/month-end/fiscal/pay-period/seasonal/business-day; duplicate/concurrency; recurrence edit/history; coverage/departure; evidence/verification; source classification; scale.
- Data collection: approve initial local templates and responsible roles; validate evidence/verification/escalation for each.
- Acceptance: one definition creates one run/occurrence; history never rewrites; every active item has source/classification/owner or explicit gap; standards proposal -> approval -> task works end to end.
- Risks: premature consolidation, incorrect historical mapping, overgeneration, policy hallucination.
- Complexity: **extra-large**.

## Phase 2 - Manager Today / command center

**Objective:** one risk-ranked morning plan and delegation/verification surface.

- Dependencies: canonical projection and real owners/durations/availability; outbox/escalation.
- Database: optimized command-center projection/view/RPC; acknowledgment/delegation/manager-review events; saved plan snapshot if needed for briefing/history.
- Backend: deterministic rank inputs, missing-data state, workload/capacity grouping, approval/verification buckets, source freshness.
- UI: risks first; mandatory due; staff misses; my work; delegate; approvals; verification; blocked; week/month preparation; explicit “more” counts; department/work-session grouping.
- Migration: dual-read compare against Today/My Day/obligations for a full operating cycle; no silent cutover.
- Security: row projection respects employee/manager/private/financial domain access; no client merge can reveal denied sources.
- Testing: rank invariants, omitted counts, paging >1,000, role views, mobile, accessibility, offline read/stale state, E2E critical flows.
- Data collection: realistic durations, operating hours, shifts, skills, risk weights approved by management.
- Acceptance: GM answers the ten command-center questions from one page; every item explains rank/source/owner/next action; employee My Day is the same canonical work filtered to them.
- Risks: noisy ranking, hidden missing data, overloaded GM, expensive cross-domain query.
- Complexity: **large**.

## Phase 3 - Staffing schedule and Kronos/pay-period workflows

**Objective:** reliable schedule publication and payroll readiness.

- Dependencies: workflow templates/runs, employees/departments, approvals, notifications; HR/payroll cutoff validation.
- Database: scheduling periods/versions/publications, availability, coverage gaps, labor budget snapshot, employee notices/change history; pay periods, employee timecard readiness, exception types/status, corrections, readiness approval.
- Backend: backward-staged month workflow; Sun-Sat boundary engine; unresolved exception escalation; late-change outbox.
- UI: demand/events/leave/availability review, draft board, labor/budget/conflicts, approve/publish/notify; Kronos checklist by employee and exception.
- Migration: preserve `schedules`, pro-shop schedules/shifts, time-off; define facility-wide canonical schedule and projections.
- Security: employees own availability/time-off/read-only published schedules; supervisors scoped; payroll/HR restricted.
- Testing: month length/year boundary/DST/holiday, conflict/concurrency, publication version, role/RLS, notification delivery, rollback.
- Data collection: schedule periods, roles/skills, operating hours, labor budgets, Kronos exception/cutoff rules confirmed by HR.
- Acceptance: next period is staged/published before configured deadline; employees notified; changes versioned; payroll run proves every employee ready or escalated.
- Risks: HR integration unavailable, duplicate staff systems, inaccurate labor costs.
- Complexity: **extra-large**.

## Phase 4 - Compliance, inspections, evidence, certifications, and environmental workflows

**Objective:** make confirmed requirements inspectable, evidenced, corrected, and verifiable.

- Dependencies: requirement/template engine, evidence/storage, private access, authoritative/local validation.
- Database: inspection definitions/versions/runs/responses/findings, environmental assets/tanks, corrective links, qualification requirements/employee qualifications/training history, retention.
- Backend: inspection generation; failure -> idempotent proposed corrective; expiry windows/restrictions; evidence completeness; independent closure verification.
- UI: standards/source library, inspection mobile runner, photos, findings/corrections, qualification coverage, expiry queue, local validation banners.
- Migration: preserve AST/environmental/checklist/certification rows with source-version mapping; no fabricated applicability.
- Security: environmental/safety/HR/evidence scoped; storage follows parent; completed inspection immutable.
- Testing: checklist version, conditional items, offline capture/replay, duplicate finding work, expiry stages, permission, retention, verification.
- Data collection: tank/assets, exact local checklists/frequencies, certification requirements, source owner, retention rules.
- Acceptance: validated inspection due -> run -> finding -> corrective task -> evidence -> independent verified closure; unvalidated drafts cannot display as mandatory.
- Risks: regulatory misclassification, sensitive incident/environmental data, weak connectivity in field.
- Complexity: **extra-large**.

## Phase 5 - Financial, procurement, inventory, and reporting workflows

**Objective:** reliable financial control, inventory accountability, and recurring submissions.

- Dependencies: Phase 0 financial RLS; canonical approvals/tasks; real data sources/mappings.
- Database: financial periods/closes/snapshots, revenue targets, forecasts, source imports, expenses, reconciliations, inventory catalog/units/cost/count/adjustment/valuation, report definitions/runs/versions/submissions.
- Backend: deterministic close/variance/forecast/COGS/margin; source completeness; PR stage/outbox integration; report preparation generation.
- UI: month close, missing sources, variance/corrective queue, 13-week outlook, inventory counts/receiving/reorder, report review/approval/submission.
- Migration: retain PR/audit/vendors/budgets/revenue; validate cost-center mappings; populate only from authoritative sources.
- Security: finance/procurement separation, approvals, department access, document privacy, no AI financial writes.
- Testing: accounting math, rounding, reconciliation, snapshot immutability, >1,000 row rollups, approvals/RLS, source replay, report hashes.
- Data collection: chart/cost centers, real expenses, sales/inventory sources, targets, report list/deadlines/recipients/retention.
- Acceptance: period close clearly states recorded/missing data; reconciled figures are reproducible; approved report version/submission is retained; variance creates owned action.
- Risks: poor source granularity, false precision, free-text mappings, restricted system integrations.
- Complexity: **extra-large**.

## Phase 6 - Course, restaurant, pro-shop, cleaning, and facility operating playbooks

**Objective:** approved shift/daily/seasonal playbooks across operating departments.

- Dependencies: templates/runs, staffing, evidence/inspections, equipment, inventory, local management approval.
- Database: location/playbook applicability, shift runs, local agronomic/seasonal plans, contractor visits, facility readiness inspections.
- Backend: shift/day/event generation, dependency grouping, weather/condition proposals, batch work sessions, missed-opening escalation.
- UI: department start/close screens, course plan, cleaning zones, restaurant/pro-shop checklists, carts/range/tee-sheet readiness, manager walkthrough.
- Migration: map existing duties/cleaning logs/watering/scheduler items; keep local adjustments and source rationale.
- Security: department/shift assignment; manager approval; food/cash/environmental restrictions.
- Testing: season boundaries, local override/versioning, shift coverage, offline mobile, evidence/verification, nonduplication, accessibility.
- Data collection: actual opening/closing standards, local agronomy, equipment/locations, restaurant controls, pro-shop/range operations.
- Acceptance: each operating shift/day has a bounded owned plan; critical misses escalate; manager readiness is evidenced; no universal agronomic/food rule is invented.
- Risks: template overload, inaccurate local standards, hundreds of low-value tasks.
- Complexity: **extra-large**.

## Phase 7 - Leagues, tournaments, marketing, hiring, and customer follow-up

**Objective:** manage growth and people/customer lifecycles end to end.

- Dependencies: projects/events, finance, staffing, communications/follow-ups, private HR/customer security.
- Database: event/league seasons/registrations/pricing/sponsorship/closeout; campaigns/channels/assets/publications/performance; requisitions/candidates/onboarding runs; customer cases/refunds/follow-ups.
- Backend: cross-department staged workflows, communication outbox/connectors, event weather plan, financial closeout, vacancy/case aging.
- UI: event pipeline/day-of/closeout, campaign calendar/approvals, hiring board/restricted candidates, customer commitment queue.
- Migration: preserve tournaments/calendar/SF-52/onboarding/concerns; convert to canonical runs/actions.
- Security: PII/customer/HR access, approvals, connector scopes, retention.
- Testing: cross-domain dependencies, duplicate communications, privacy/RLS, registration/financial reconciliation, 30/60/90 dates, campaign metrics.
- Data collection: league/event formats/pricing, channels/approval, HR process, complaint/refund policy.
- Acceptance: event/campaign/hire/case has one owner and staged plan; actions reach staff queues; finance/communications/lessons close; privacy holds.
- Risks: connector dependency, customer/HR privacy, commercial rules not recorded.
- Complexity: **extra-large**.

## Phase 8 - AI operational planning, risk detection, workload optimization, and executive reporting

**Objective:** add assistive intelligence only after deterministic data and controls are trustworthy.

- Dependencies: complete canonical event/history, data quality, workload/capacity, approved risk weights, human approval paths.
- Database: AI recommendation/proposal records, input snapshot/hash, model/prompt/version, confidence, disposition, feedback, approval, audit.
- Backend: summarization, clustering/grouping, anomaly/risk detection, workload recommendations, briefing narrative; deterministic hard deadlines remain outside AI.
- UI: clearly labeled recommendations with sources/confidence/review; accept/edit/dismiss reason; never silent mutation.
- Migration: none that changes official frequencies; recommendations link to existing requirement/template/task versions.
- Security: minimum source context, sensitive-domain redaction/access, no autonomous financial/HR/safety/environmental/compliance writes.
- Testing: source grounding, prompt injection, hallucinated-policy rejection, regression/evaluation sets, model-change comparison, authorization, cost/rate limits.
- Data collection: approved outcome/priority feedback, actual completion times, dismiss reasons; never silently learn official frequency.
- Acceptance: recommendation explains data/source, cannot impersonate a mandate, requires approval for major change, and measurably improves prioritization without task flooding.
- Risks: hallucinated authority, automation bias, sensitive-data leakage, false confidence, model drift.
- Complexity: **large** after foundations; **unsafe before them**.

## Cross-phase release gates

Every phase requires:

1. exact target/environment and migration-ledger evidence;
2. before/after count, policy, integrity, and history checks;
3. preview/disposable RLS and role E2E tests;
4. rollback/forward-fix and restore plan;
5. no direct production fixtures or fabricated operational data;
6. full targeted and repository tests passing;
7. explicit list of unverified policy/business inputs;
8. production smoke plan using existing approved records only;
9. user authorization before migration/deploy/merge/push;
10. retained release evidence and observed limitations.
