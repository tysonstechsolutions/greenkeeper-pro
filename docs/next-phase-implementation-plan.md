# Next-phase implementation plan

## Selected phase

**Phase 0B: private people records, identity-safe mutations, and remaining least-privilege boundaries.**

This remains the next practical phase because the application cannot safely connect employee development, schedules, certifications, incidents, payroll, finance, and the command center while any authenticated account can manage sensitive records. The live command-center completion boundary is audited, and the repository now contains locally proven staff-record and personnel-directory corrections. Calendar, certification, onboarding, schedule, inventory, and financial boundaries remain inconsistent.

The first two Phase 0B slices are implemented in this repository as `20260716150000_staff_privacy_security.sql` and `20260716170000_profiles_personnel_privacy.sql`. Neither is applied or deployed.

## Why this phase wins

1. `staff_one_on_ones`, `staff_concerns`, `staff_one_on_one_sessions`, `staff_engagement_profiles`, `staff_records`, and `staff_documents` were created with all-authenticated CRUD policies.
2. The one-on-one and engagement tables store discussion answers, concerns, family/interests, goals, and communication notes. `staff_records` can contain disciplinary, sick-time, call-out, holiday-pay, hours, and amount facts.
3. A private storage bucket is insufficient when every authenticated account still has object SELECT permission.
4. Live count-only evidence shows all six affected tables are empty, so the forward policy/actor correction does not require a speculative data backfill.
5. A direct local fix is testable with synthetic identities and does not require an unverified Navy, CNIC, HR, payroll, or retention claim.

## Implemented slice

### Work package 0B.1 - private staff database boundary

Purpose: make the existing people-record tables safe enough to hold real data without introducing a second HR model.

Files:

- `supabase/migrations/20260716150000_staff_privacy_security.sql`
- `supabase/tests/staff_privacy_security.sql`
- `scripts/test-staff-privacy-security-local.mjs`
- `src/__tests__/unit/people/staff-privacy-security.test.ts`
- `package.json`

Schema changes:

- add `updated_by` to scheduled 1:1s, concerns, structured sessions, and staff records;
- add `created_by` and `updated_by` to engagement profiles;
- add `can_manage_staff_member(employee_id)` using active-manager or recorded-direct-supervisor authorization;
- add database-derived mutation attribution and immutable employee identity;
- add completed/history guards.

RLS and grants:

- active managers and the employee's recorded direct supervisor may read/create/update scheduled 1:1s, concerns, sessions, and engagement profiles;
- HR/pay/disciplinary `staff_records` remain active-manager only;
- employee-document metadata and storage objects remain active-manager only;
- employees and unrelated authenticated users receive no row/object access merely because they are signed in;
- completed 1:1 sessions cannot be rewritten; scheduled 1:1, concern, engagement, session, and staff-record history cannot be deleted through authenticated grants or a table-owner bypass;
- employee documents remain deletable by a manager because an authoritative retention rule has not been established. A later retention policy must define archive/legal-hold behavior before changing that fact.

Actor behavior:

- `created_by`, `updated_by`, and `uploaded_by` come from `auth.uid()`;
- caller-supplied actor IDs are ignored;
- an authenticated actor is mandatory;
- an existing private record cannot be moved to another employee.

### Work package 0B.2 - pre-query UI guards

Purpose: avoid mounting broad full-profile and cross-employee-insights queries for non-admin roles while RLS remains authoritative.

Files:

- `src/app/staff/profile/page.tsx`
- `src/app/staff/insights/page.tsx`

Behavior:

- full employee profile/HR queries mount only for `ADMIN_ROLES`;
- cross-employee one-on-one insights mount only for `ADMIN_ROLES`;
- these guards do not replace RLS;
- direct-supervisor UI delegation remains a deliberate follow-up. The database predicate is ready, but a focused supervisor UI must avoid exposing HR/document/profile-edit controls.

### Work package 0B.3 - data-readiness evidence

Purpose: keep the audit count-only and verify migration presence without printing production records.

Files:

- `scripts/audit-data-readiness.mjs`

Change:

- include `obligation_completion_audit_events` in the exact-count inventory. Four live events confirm the earlier command-center migration is present; no business-row values were downloaded or printed.

## Migration sequence

No production action is authorized by this plan.

1. Freeze the intended target and capture the linked migration ledger, current policies/grants, bucket posture, and exact counts.
2. Confirm backup/restore readiness and obtain the product owner's authorization for the manager/direct-supervisor split.
3. Apply the full retained chain to a disposable local database and run the staff-privacy SQL matrix.
4. Apply through `20260716170000` in a preview/staging project.
5. Re-run a role matrix with approved test accounts: GM, superintendent/administrator, direct supervisor, subject employee, unrelated employee, and service role.
6. Exercise the UI with no fabricated production history: open the full profile as an admin; run a draft then completed 1:1; verify direct-supervisor API scope; verify employee/unrelated denial; upload/open/delete a test document only in preview.
7. Capture before/after policy and bucket evidence and check that existing row counts and content hashes are unchanged.
8. Only after explicit user authorization, release the migration and compatible UI together. Do not deploy the UI guard ahead of an incompatible database state if it would strand an approved supervisor workflow.
9. Retain the exact migration output, role results, observed denials, and forward-fix plan.

## Tests

Implemented tests:

- static migration/UI contracts: `npm.cmd exec vitest run src/__tests__/unit/people/staff-privacy-security.test.ts`;
- disposable role/storage/history matrix: `npm.cmd run test:staff-privacy-security`;
- retained migration replay: `npm.cmd run test:historical-replay`;
- existing command-center matrix: `npm.cmd run test:command-center-security`;
- full Vitest, typecheck, lint, and production build.

The SQL matrix covers:

- manager access;
- recorded direct-supervisor access to 1:1 domains only;
- subject-employee denial;
- unrelated-employee denial;
- denial for a supervisor targeting a non-report;
- manager-only HR/document metadata and storage access;
- actor spoofing on insert/update;
- immutable employee linkage;
- completed-session protection;
- history deletion protection;
- transaction rollback of every synthetic row.

## Rollback and forward-fix considerations

Preferred recovery is a forward fix. Do not restore the broad all-authenticated policies.

- If a legitimate role is blocked, add the narrowest evidenced predicate in a new migration and extend the role matrix first.
- If a current row has a missing/invalid actor, do not invent one. Preserve null/legacy state and add a reasoned, reviewed compatibility path.
- If a storage path does not match its metadata row, quarantine it in preview evidence; do not expose the bucket or fabricate an employee link.
- If application code assumes deletes for durable staff history, replace that behavior with status/void/correction semantics rather than reopening raw DELETE.
- If migration application fails transactionally, retain the old state and diagnose. Do not apply partial policy edits manually in production.

## Production verification

Required after an authorized release:

1. migration ledger contains `20260716150000` and `20260716170000` exactly once each;
2. no `FOR ALL ... USING (true) WITH CHECK (true)` policy remains on the six private tables;
3. the staff-documents bucket is non-public and its object policies require `is_manager()`;
4. unrelated and subject employees receive empty/denied responses for private rows and signed-object access;
5. manager CRUD and direct-supervisor 1:1 operations work only within the intended scope;
6. created/updated/upload actors equal the authenticated caller even when a client sends a different ID;
7. completed session mutation and private-history deletion fail;
8. counts, existing IDs, and existing business values are unchanged;
9. application logs contain no unexpected 401/403 loop or sensitive row payload;
10. no production fixture, policy claim, staff note, or document was fabricated for testing.

### Work package 0B.4 - split personnel privacy from the staff directory

Status: **implemented and locally verified; not applied or deployed**.

`20260716170000_profiles_personnel_privacy.sql` copies every profile's exact hire date, emergency contact, legacy certification JSON, and SF-52 personnel details into the restricted one-to-one `staff_personnel_private` table, verifies the copy, and drops the four source columns without `CASCADE`. Employees may read their own private row; active managers maintain all rows; recorded supervisors receive no implied emergency/pay access. `staff_directory` is the narrow non-HR lookup contract. A trigger blocks employee role/department/supervisor/activation escalation, and `update_staff_profile` provides one allowlisted atomic admin command for directory and private changes.

Application updates route staff profile, SF-52, schedule-import, report, briefing, compliance, and AI-directory callers to the correct surface. Admin-only pages guard before personnel queries mount. The historical replay, database lint, transactional manager/supervisor/employee/unrelated matrix, and prior security matrices pass locally.

## Remaining Phase 0B work packages

### 0B.5 - calendar, certification, onboarding, and schedule authorization

Define owner/attendee/supervisor/department/manager predicates, forced actors, update/delete rules, and history for `calendar_events`, certifications/training, onboarding runs/documents, generic schedules/time off, and pro-shop schedules. Do not use one all-purpose manager predicate where employee self-service is required.

### 0B.6 - financial, procurement, inventory, incident, and remaining storage boundaries

Classify read/write/approval rights by domain, add independent approval where required, and test row plus object access. Do not infer finance, HR, safety, food-service, or environmental authority from route visibility.

### 0B.7 - audit/outbox, department cleanup, and restore proof

Add transactional audit/outbox coverage for protected state changes, fill the ten missing departments only from reviewed source data, resolve the one unowned obligation, document bucket retention, and complete a restore drill. Phase 0 exits only when the role matrix and restore evidence cover every authoritative operational domain.

## Explicit non-goals

- No production migration, deployment, data write, push, merge, or branch change.
- No fabricated staff notes, HR records, documents, departments, tasks, completions, evidence, or policy sources.
- No claim that the current one-on-one cadence is a Navy/CNIC requirement.
- No canonical task-engine consolidation in this slice.
- No payroll, schedule-publication, incident, certification, food-safety, or environmental workflow expansion before their security and source requirements are explicit.
- No mass assignment of the 649 generated tasks.

## Acceptance criteria for this slice

- the repository migration replays from the retained historical chain;
- the synthetic manager/supervisor/employee/unrelated matrix passes and rolls back;
- actor spoofing, cross-employee access, document-object access, completed-session edits, and history deletes are denied as designed;
- full-profile and cross-employee-insights queries do not mount for non-admin application roles;
- legacy profile personnel values are copied exactly before the source columns are dropped;
- employees read only their own private personnel row, direct supervisors cannot read subordinate emergency/pay data, and ordinary directory callers receive no private fields;
- employee role/department/supervisor/activation escalation is denied while safe self-profile edits remain available;
- manager profile edits update directory and private rows through the allowlisted atomic command;
- all targeted and full repository checks pass;
- both people-security migrations are reported honestly as **implemented locally, not applied or deployed**.
