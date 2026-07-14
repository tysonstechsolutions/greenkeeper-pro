# Phase 1A controlled production runbook

This runbook is for the one pending Daily Operations Phase 1A corrective migration:

`supabase/migrations/20260713230000_daily_operations_phase1a_corrective.sql`

There is no staging environment. The first complete database execution will therefore occur in production, only after an explicit user authorization to merge, migrate, and deploy. This document does not authorize that action.

## Preconditions

1. The approved branch is `codex/phase1a-corrective-pass`; confirm the intended commit and that the search commit `4c5ad5b` is not in its history.
2. PR #23 remains a draft until all preflight evidence is reviewed.
3. Re-run the validated checks in CI's Node 20 runtime. Do not proceed on a red check.
4. Use a local checkout linked to production ref `mbgublyqnyghmvqfooao`; do not link a different project merely to satisfy the command.
5. Obtain a direct Postgres connection string from the Supabase production project dashboard and set it only for the current shell as `PHASE1A_PRODUCTION_DB_URL`. Do not save it in `.env`, a script, a terminal transcript, or a report.
6. Confirm that an existing Supabase backup/point-in-time restore capability is visible for the production project. Record its date, retention window, and any backup or restore identifier in the release record. This repository does not claim a rollback or restore capability that has not been confirmed in the dashboard.
7. Choose an approved low-activity maintenance window. If an existing maintenance-safe mechanism is available, enable it according to its own operating procedure; this release does not create or improvise one.
8. Identify real, already-recorded accounts and duties for read-only post-release smoke checks. Do not create fabricated employees, duties, assignments, durations, or policies.

## Pre-migration evidence

Inject the direct database URL into `PHASE1A_PRODUCTION_DB_URL` through the approved secret-management workflow for the current process only. If that workflow is not available, stop; do not paste the URL into a committed file, a shell command, or terminal history.

Run the read-only capture:

```powershell
node scripts/phase1a-production-evidence.mjs before --project-ref mbgublyqnyghmvqfooao --out-dir C:\tmp\greenkeeper-phase1a-evidence
```

The script refuses any other project ref or a non-direct `db.<project-ref>.supabase.co` host. It captures the migration ledger, relevant schema, RLS policies, grants, row counts, duty/assignment integrity, occurrence status counts, task-policy inventory, legacy writer inventory, and affected anonymous grants. Review and archive the generated Markdown and JSON outside the repository.

Stop immediately if:

- the project ref, database host, or linked project ref is not `mbgublyqnyghmvqfooao`;
- the ledger has an unexpected history mismatch, especially any `20260407` issue;
- the evidence shows unexpected anonymous access, permissive task policies, legacy writers, overlapping assignments, duplicate occurrence identities, or missing Phase 1A prerequisites;
- backup capability cannot be confirmed.

## Migration application

Do not run this section without an explicit user authorization for production migration. The application command is isolated from the read-only evidence script and requires a typed confirmation:

```powershell
.\scripts\apply-phase1a-production.ps1 `
  -ProjectRef mbgublyqnyghmvqfooao `
  -TypedConfirmation APPLY_PHASE1A_TO_PRODUCTION `
  -DryRunOnly
```

The dry run must list exactly `20260713230000_daily_operations_phase1a_corrective.sql`, no other migration IDs, and no `20260407` migration history. If it does, run the same command again without `-DryRunOnly`:

```powershell
.\scripts\apply-phase1a-production.ps1 `
  -ProjectRef mbgublyqnyghmvqfooao `
  -TypedConfirmation APPLY_PHASE1A_TO_PRODUCTION
```

The script uses the normal `supabase db push --linked` mechanism. It never uses `--include-all`, never rewrites migration history, and stops before applying anything when the dry-run is ambiguous.

## Post-migration database validation

Before deploying application code, run:

```powershell
node scripts/phase1a-production-evidence.mjs after --project-ref mbgublyqnyghmvqfooao --out-dir C:\tmp\greenkeeper-phase1a-evidence
node scripts/phase1a-production-evidence.mjs compare `
  --before C:\tmp\greenkeeper-phase1a-evidence\<before>.json `
  --after C:\tmp\greenkeeper-phase1a-evidence\<after>.json `
  --out-dir C:\tmp\greenkeeper-phase1a-evidence
```

The after capture must record the migration exactly once and pass its security/integrity checks. The comparison must show that completed and verified task history did not decline. Failure is a stop condition; do not deploy the application code until it is understood and accepted through a forward fix or an approved provider-supported restoration.

## Application deployment

Only after post-migration evidence passes and the user explicitly authorizes it:

1. Merge PR #23 into `main` using the approved GitHub workflow.
2. Confirm that the resulting production deployment is tied to the merged commit, not a Preview deployment.
3. Do not use Vercel Preview as a production test environment.
4. Preserve the pre-migration evidence, post-migration evidence, comparison report, merge commit, deployment identifier, and backup confirmation in the release record.

## Role smoke checks

Run these with existing accounts and real, already-recorded duties only. Read-only checks come first. A status transition or reassignment is an operational change and requires the normal business approval for that real work; never create test fixtures in production.

| Role or path | Smoke check | Expected result |
| --- | --- | --- |
| GM / operations manager | Open `/operations/duties`; load canonical duties, assignments, recurrence history, audit history, temporary coverage, and legacy roster links. | Data loads; only authorized managers can see management history; no writable legacy route remains. |
| Legacy route | Open `/pro-shop-schedule/duties`. | Redirects to `/operations/duties`; no parallel writable workflow. |
| Primary employee | Open Today/My Day with a real assigned occurrence. | Sees only their permitted task occurrence and its recorded requirements. |
| Unrelated employee | Open Today/Tasks using an existing account that is not assigned to that occurrence. | Cannot read or change another employee's duty task or management history. |
| Foreman | View a real crew task. | Sees and can execute only tasks authorized by its existing crew membership. |
| GM / manager task action | Inspect a real pending task's existing assignment attribution after an authorized edit. | `assigned_by` reflects the authenticated manager; it cannot be forged through normal client access. |
| Evidence-required occurrence | Use an already-required real task only when the operational owner approves the action. | Completion remains blocked until evidence is recorded through the approved workflow; direct table writes are rejected. |
| Temporary coverage / recurrence / move | Inspect pre-existing real records only. | Completed/verified history remains intact; moved occurrence keeps its identity and is not regenerated. |

If an appropriate real account or record does not exist, record that smoke case as not exercised. Do not invent data to make the checklist look complete.

## Stop and recovery conditions

Stop the release when the migration command, after-evidence capture, comparison, role smoke, or deployment check fails. Keep the application in its approved maintenance-safe state if one is already available.

There is no automatic down migration in this release. Prefer a reviewed forward fix. If restoration is necessary, use only the Supabase backup/restore option confirmed before the release, follow the provider's target-selection prompts, and obtain explicit user authorization before restoring any environment. Do not assume an in-place restore, a point-in-time recovery window, or application-code compatibility without verifying it at the time.

For an application-only problem after a successful migration, do not blindly redeploy older code. First determine whether the older code is compatible with the migrated schema; otherwise keep the maintenance-safe state and forward-fix.

## Final acceptance record

Record all of the following before closing the release:

- user authorization time and scope;
- production project ref and direct-host verification;
- backup capability confirmation;
- before/after/comparison evidence paths and check outcomes;
- migration ledger row for `20260713230000`;
- merged commit and production deployment identifier;
- each role smoke result, including intentionally unexercised cases;
- any exception, forward fix, or restoration action.

Do not merge, migrate, or deploy based solely on this document. Each remains an explicit authorization decision.
