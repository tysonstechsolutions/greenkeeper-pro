# Operations Command Center production runbook

## Scope and safety

The production change is migration `20260716190000_unified_operations_command_center.sql` plus the `/operations` application surface. The migration preserves authoritative source tables and adds cross-source workflow state. It does not require destructive data conversion.

Do not apply this migration to production before the target commit passes the checks below in a disposable local Supabase stack. Do not point replay or role-matrix scripts at a hosted project; both scripts refuse the known production project reference and non-local database configuration.

## Required pre-deployment verification

From the repository root on Windows PowerShell:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run
npm.cmd run build
npm.cmd run test:historical-replay
npm.cmd run test:unified-operations-security
supabase db lint --local
```

`test:historical-replay` rebuilds disposable local databases and exercises empty and compatible historical fixtures. `test:unified-operations-security` runs inside `supabase_db_greenkeeper-pro-phase1a-matrix` and rolls back all synthetic users and work records.

Also run the established security matrices because this migration composes with their authorization helpers:

```powershell
npm.cmd run test:command-center-security
npm.cmd run test:staff-privacy-security
npm.cmd run test:personnel-privacy-security
```

## Migration review

Before deployment, confirm:

- migration history contains `20260716190000` exactly once;
- all seven `operational_work_*` tables have RLS enabled;
- `anon` has no grants on those tables;
- `authenticated` has select only, with no direct insert/update/delete grants;
- Program Standards have no direct authenticated writes;
- every public workflow command is revoked from `PUBLIC` and granted only to `authenticated` where intended;
- the disposable role matrix reports `PASS unified Operations workflow, dependency, leadership, standards, and RLS matrix`.

## Application acceptance

Use an active management account and a non-management employee account.

Desktop and narrow/mobile viewport:

1. Open `/operations` and confirm the page is usable without horizontal page scrolling.
2. Confirm search, all filters, section counts, deterministic explanations, and direct source links.
3. Confirm `/today` redirects to `/operations` and `/my-day` redirects to `/operations?view=mine`.
4. Delegate work to a named employee and to a position; confirm the employee sees only authorized work.
5. Accept, start, request clarification, attach evidence, submit for verification, and verify a delegated item.
6. Postpone an item and confirm explanation plus resume/review date are required.
7. Add a dependency; confirm both sides are visible. Complete and verify the blocker, then confirm automatic reactivation appears in activity.
8. Send an item to leadership, confirm the source remains open, record a response/outcome, and confirm the selected next action.
9. On Program Standards, record partial progress, evidence, completion, not applicable with required reason, and reopen; confirm version/evidence history.
10. Reopen a completed task and confirm a successor task is created while the original remains complete.

## Deployment sequence

1. Take the normal managed-database backup or confirm point-in-time recovery is healthy.
2. Deploy the database migration before the application build that queries the new workflow tables.
3. Verify the migration record and PostgREST schema reload.
4. Deploy the application build.
5. Smoke-test `/operations`, `/standards`, a task deep link, an equipment deep link, a purchase-request deep link, and the two compatibility redirects.
6. Run the management and employee acceptance checks above with non-production-impacting records or an approved test fixture.
7. Monitor application errors, PostgREST authorization failures, and workflow RPC failures during the initial operating window.

## Rollback and recovery

Prefer forward correction after workflow data exists. Application rollback is safe because existing source tables remain authoritative; older builds ignore the new workflow tables and Program Standard planning columns.

If the application must be rolled back:

1. roll back the application build;
2. leave migration `20260716190000` installed so workflow history is preserved;
3. stop creating new cross-source workflow actions until the corrected build is deployed;
4. inspect `operational_work_events` and source records before any manual correction.

Do not delete workflow events or evidence, rewrite ended assignments/postponements/dependencies, or mark a migration reverted by hand. If database rollback is unavoidable before any production workflow data is created, use the organization’s reviewed migration procedure and a verified backup; do not improvise destructive SQL from this runbook.

## Incident triage

- Missing items: verify source RLS first, then `can_read_operational_work`, stable ID construction, and active filters.
- Split lifecycle: compare the source record, current `operational_work_states` row, assignment, and ordered events. Correct through an approved command.
- Dependent did not reactivate: verify the blocker is satisfied, including verification requirements, and check for another active dependency, postponement, or leadership handoff.
- Leadership item completed unexpectedly: inspect the handoff outcome and `next_action`; completion is permitted only for approved/completed outcomes and supported source kinds.
- Standard history mismatch: compare `program_standards.version`, `program_standard_versions`, `standard_evaluations`, evidence, and operational events. Do not edit the standard directly.
- Access denial: confirm the profile is active, its recorded role, source ownership, assignment, and manager helper result. Do not broaden RLS to solve a single fixture problem.
