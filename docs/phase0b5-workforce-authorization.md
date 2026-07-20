# Phase 0B.5 workforce authorization

Status: **implemented and locally verified; production migration and application deployment pending**.

Migration `20260720120000_phase0b5_workforce_authorization.sql` establishes the least-privilege authorization boundary for calendar events, certifications, onboarding documents, generic schedules and time off, and pro-shop schedules. It preserves existing business rows and moves protected browser writes behind security-definer commands with fixed search paths.

## Authorization contract

- Active managers administer all covered records.
- Employees may read their own certification, schedule, and time-off records and may submit or cancel only their own eligible time-off requests.
- Recorded direct supervisors may manage schedules and time off for their direct reports.
- The established `pro` role may schedule only pro-shop staff, golf operations assistants, and recreation aides.
- The shared operational calendar is readable by active staff; only managers or the creating employee may change or cancel an event.
- New certification evidence is stored in the private `certification-documents` bucket. Access requires a linked certification row plus manager, employee-owner, or direct-supervisor authority; only unlinked uploads may be deleted as cleanup. Legacy evidence remains in `photos` until an authorized copy-and-verify migration can preserve every reference without breaking other photo workflows.
- Onboarding definitions and pro-shop publication remain manager-only.

Every protected mutation derives its actor from `auth.uid()`, rejects direct table writes, records an append-only before/after audit event, and emits a transactional outbox event. User-visible removals are terminal state transitions rather than destructive deletes. Pro-shop shift replacement uses stable generation keys so retries are idempotent.

## Application integration

The calendar, certification, onboarding, staff schedule, time-off, one-on-one action, and pro-shop schedule callers now use the command functions. Read paths exclude canceled, retired, or voided rows where appropriate. Admin-only certification, onboarding, and pro-shop pages gate their protected queries before they mount.

## Local verification

The release gate includes:

- historical migration replay from an empty database through the Phase 0B.5 migration;
- database lint;
- a transactional manager, direct-supervisor, employee, and unrelated-user SQL matrix;
- actor-spoof, direct-write, row-policy, evidence-object, terminal-state, rollback, audit, outbox, and idempotency assertions;
- focused static caller tests plus the repository typecheck, lint, unit/integration suite, build, and browser acceptance suite.

## Production order

The database migration must be applied and verified before the application commit is released because the new callers depend on its functions and columns. Production application, migration, and storage changes must follow the repository runbook and require explicit authorization for the linked hosted database.
