# Next-phase implementation plan

## Selected phase

**Phase 0: security, identity, row-level authorization, auditability, and source-of-truth corrections.**

This phase is first because the current product already exposes valuable operating workflows, but several authenticated-table policies allow any signed-in user to write records outside their responsibility. Consolidating task systems or adding AI before correcting those trust boundaries would make the eventual command center faster at spreading ambiguous or forged state.

The first shippable slice is the command-center obligation and My Day boundary. It is intentionally narrower than the full Phase 0 roadmap:

- completion and correction of an obligation must be an authorized server command;
- the database, not the browser, records the actor;
- deletion of a completion must require a manager reason and leave an immutable audit snapshot;
- obligation visibility follows manager, primary-owner, or backup-owner scope;
- My Day goals and steps are private to their creator;
- the assistant must use the same obligation command and period semantics as the UI.

This slice does **not** apply a migration, deploy, change production data, or claim that all repository RLS is corrected.

## Exact implementation scope

### Database and RLS

Add one forward-only migration that:

1. creates an append-only `obligation_completion_audit_events` table;
2. creates `can_execute_obligation(obligation_id)` using the authenticated identity and existing server-side management-role helper;
3. replaces permissive obligation policies with manager/owner/backup read scope and manager-only definition writes;
4. removes direct completion inserts, updates, and deletes for `authenticated`;
5. adds `complete_operational_obligation(...)`, which validates authorization and period format, derives `completed_by` from `auth.uid()`, and is idempotent for the obligation/period pair;
6. adds `void_operational_obligation_completion(...)`, which is manager-only, requires a correction reason, and deletes through an audited command;
7. captures completion and void events with actor, time, reason, and row snapshot;
8. replaces `daily_goals` and `daily_steps` all-authenticated policies with creator-owned policies, including a parent-goal ownership check for steps.

### Application commands

Change the operations hook so it never writes `obligation_completions` directly. Completion and correction call the database RPCs. The correction action is offered only to the same management roles recognized by the database and must collect a reason before the command runs.

### Assistant parity

Change the AI assistant action handler so `complete_obligation` calls the same RPC. Correct weekly period keys to the existing Sunday-through-Saturday convention (`WYYYY-MM-DD`) and include weekly obligations in the current-period read.

### Repeatable readiness evidence

Keep the count-only readiness script as an audit tool. It may authenticate with the configured control account, but it selects no business rows and performs no writes. Its results are environmental evidence, not fixtures or a migration precondition.

## Files and systems expected to change

| Area | File or system | Change |
|---|---|---|
| Database | `supabase/migrations/20260716010000_command_center_security.sql` | RLS, command RPCs, append-only completion audit |
| Today data hook | `src/lib/operations/use-operations.ts` | Replace raw completion writes with RPCs; expose correction authorization |
| Manager Today | `src/app/today/page.tsx` | Manager-only correction with required reason |
| Workspace landing | `src/components/layout/workspace-landing.tsx` | Same correction behavior as Today |
| AI assistant | `supabase/functions/ai-assistant/index.ts`; `supabase/functions/_shared/obligation-period.ts` | RPC completion and Chicago-calendar weekly/month/quarter/year parity |
| Unit/security contract tests | `src/__tests__/unit/operations/command-center-security.test.ts` | Verify migration and client command invariants |
| Database RLS matrix | `supabase/tests/command_center_security.sql` | Transactional unrelated/owner/backup/manager authorization, attribution, idempotency, correction, privacy, and tamper tests |
| Local database runner | `scripts/test-command-center-security-local.mjs`; `package.json` | Refuse non-local targets and execute the SQL matrix against the disposable replay container |
| Readiness evidence | `scripts/audit-data-readiness.mjs` | Count-only operational data checks |
| Audit documents | Six documents under `docs/` | Evidence, target model, roadmap, and handoff |

## Migration sequence

1. Confirm the target project, current migration ledger, backup/restore path, and expected pre-migration column/policy signatures.
2. Run the migration against a disposable local database built from the complete historical chain.
3. Seed only synthetic role fixtures: unrelated employee, primary owner, backup owner, GM, and service caller.
4. Exercise the RLS/RPC matrix, idempotency, actor-forgery, audit immutability, and My Day ownership tests.
5. Rehearse on a preview/staging clone and compare count-only before/after evidence. Do not copy or expose sensitive row contents.
6. Deploy compatible UI and Edge Function code with the migration in one authorized release window. Because clients switch from raw table writes to RPCs, do not deploy the client ahead of the RPC migration.
7. Perform production smoke checks using existing approved identities and records only. Do not create fake production obligations or completions.
8. Retain migration output, policy/grant snapshots, test evidence, and observed limitations with the release record.

## Security requirements and role matrix

| Action | Unrelated employee | Primary/backup owner | Server management role | Anonymous |
|---|---:|---:|---:|---:|
| Read an obligation | No | Yes | Yes | No |
| Create/edit/delete an obligation definition | No | No | Yes | No |
| Complete current obligation | No | Yes | Yes | No |
| Set a different completion actor | No | No | No | No |
| Void/correct a completion | No | No | Yes, with reason | No |
| Mutate completion audit | No | No | No | No |
| Read/write another user's My Day | No | No | No | No |

The application role check is a usability guard only. Database authorization remains authoritative. Role names in application navigation that differ from `can_manage_daily_operations()` are a separate Phase 0 reconciliation item and must not be silently widened in this slice.

## Test plan

### Static and unit contracts in this repository

- Migration contains no globally permissive policies for the four hardened tables.
- Completion table DML is revoked and only command functions are executable.
- RPCs require `auth.uid()`, ignore client-supplied actor identity, enforce authorization, validate period shapes, and handle duplicate completion safely.
- A correction requires a nonblank reason and creates an audit snapshot before history is removed.
- Audit rows are append-only.
- My Day child rows cannot point to another creator's goal.
- UI and assistant contain no raw `obligation_completions` insert/delete path.
- UI correction is restricted to the database-aligned management roles.
- Assistant and operations engine agree on weekly period keys.
- Existing weekly date-boundary, recurrence, Today, TypeScript, lint, full unit/integration, and production build checks remain green.

### Required database integration tests before release

- Each matrix role runs SELECT/INSERT/UPDATE/DELETE/RPC probes in a disposable database.
- Primary owner and backup can complete; unrelated employee cannot.
- Forged actor parameters are impossible because none are accepted.
- Two concurrent completion requests leave one completion and a deterministic success result.
- Manager correction removes the active completion but preserves actor/time/snapshot/reason in audit.
- Direct deletion and audit mutation fail for all application roles.
- Goal and step cross-owner reads/writes fail, including a step attached to a foreign goal.
- Existing rows remain readable to their legitimate actors after policy replacement.

Repository string-contract tests are regression guards; they do not replace execution against PostgreSQL RLS. In this session the SQL also passed the full historical replay and the transactional four-role database matrix. Staging/preview execution remains mandatory before release.

## Rollback and forward-fix strategy

The preferred recovery is a forward fix, not an automatic down migration.

- If the client fails but authorization is correct, roll back the client/Edge release while leaving secure policies and RPCs in place only if the prior client is known to use those RPCs. Otherwise deploy a reviewed compatibility function; do not reopen broad direct writes.
- If an authorization predicate is wrong, issue a narrow follow-up migration that repairs the helper or policy. Preserve the audit table and completion history.
- If the migration fails transactionally, no partial policy state should remain.
- Never restore global `USING (true) WITH CHECK (true)` as a convenience rollback.
- A database restore is reserved for proven integrity loss and must use the pre-confirmed restore procedure. The audit event stream should be retained wherever legally and operationally appropriate.

## Production verification plan

After an explicitly authorized release:

1. verify migration ledger and function signatures on the intended project;
2. rerun anonymous probes and role-matrix queries;
3. have one approved obligation owner complete an existing due obligation and confirm server actor/time;
4. have one approved manager correct that completion with a real reason and confirm the audit snapshot;
5. confirm an unrelated employee cannot read or complete it;
6. confirm two real users cannot see or mutate one another's My Day records;
7. confirm Today and workspace landing show the same state after refresh;
8. confirm assistant weekly listing and completion use the same period as Today;
9. inspect error/denial metrics and support reports through one normal operating cycle;
10. record all evidence without including sensitive business row contents in logs.

## Known limitations after this slice

- The repository still contains other broad authenticated policies, including later calendar, staff, pro-shop, inventory, and financial modules; those remain Phase 0 blockers.
- Obligations remain a parallel work model rather than canonical task occurrences.
- The audit table is obligation-specific; the target architecture still needs a general append-only audit/outbox model.
- Correction currently removes the active completion while preserving an audit snapshot. A future canonical occurrence model should prefer status transitions over deletion.
- Manager roles are not yet unified across UI navigation, database helpers, and every domain.
- The migration executed successfully in a disposable local PostgreSQL/Supabase replay, but no staging/preview environment was available; staging role tests and migration-ledger evidence remain release gates.

## Explicit non-goals

- No production migration, deployment, data write, push, merge, or branch-history rewrite.
- No mass assignment of the 644 generated tasks.
- No fabricated task completions, evidence, departments, staff records, or compliance data.
- No claim that the 93 program standards are authoritative legal requirements.
- No consolidation of duties, obligations, My Day, standards actions, and schedule work in this slice.
- No autonomous AI creation or reprioritization of official work.
- No redesign of the full Today interface.
- No connector integration with Kronos, payroll, email, calendar, marketing, or accounting systems.

## Definition of done for this repository session

- All six required documents exist and agree on scores, sequencing, and evidence boundaries.
- The command-center security migration and application callers are implemented.
- Targeted and full repository verification pass, or every failure is reported with exact scope.
- The migration is explicitly reported as **created but not applied**.
- The full historical local replay and command-center RLS matrix pass with synthetic fixtures rolled back.
- The work is committed locally with the starting base and final commit recorded; nothing is pushed.
