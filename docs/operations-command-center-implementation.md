# Operations Command Center implementation

## Delivered surface

`/operations` is the production command center for actionable operational work. It projects existing domain records into one normalized list; it does not copy those records into a second task engine.

The page includes tasks, generated duty occurrences, obligations, Program Standards, personal goals and steps, calendar deadlines, equipment alerts, and purchase requests. Each item is assigned exactly one primary section so count totals do not double count work:

- Critical now
- Overdue
- Due today
- Due soon
- Quick wins
- My work
- Delegated
- Waiting on someone
- Waiting on leadership
- Blocked
- Needs verification
- Program improvements
- Upcoming
- Completed recently

Management can search and filter by department, employee, position, status, source, priority, due date, duration, Program Standard, delegation, blocked state, and leadership state. `/my-day` is a compatibility adapter to `/operations?view=mine`; `/today` redirects to `/operations`. Navigation and the application home route now point to Operations.

## Source ownership and adapters

Existing tables remain authoritative:

| Source | Authoritative record | Command-center behavior |
| --- | --- | --- |
| Tasks and duties | `tasks` | Duties remain generated task occurrences and use the hardened task lifecycle. |
| Obligations | `obligations`, `obligation_completions` | Completion uses the existing server-attributed obligation command. |
| Program Standards | `program_standards` | Progress, evidence, evaluations, owner changes, and reopen actions use audited commands. |
| Goals and steps | `daily_goals`, `daily_steps` | Personal rows retain creator-scoped privacy. |
| Calendar | `calendar_events` | Deadlines and events deep-link to Calendar. |
| Equipment | `equipment` | Service, repair, and out-of-service states appear as alerts. |
| Purchase requests | `purchase_requests` | Open requests deep-link to their source workflow. |

`src/lib/operational-work/adapters.ts` supplies source adapters and applies workflow overlays. `dedupeOperationalWork` enforces one projection per stable ID. Completed work is retained in the command center for fourteen days.

## Workflow model

Migration `20260716190000_unified_operations_command_center.sql` adds cross-source workflow state without replacing source lifecycles:

- `operational_work_states` stores the current projection state and priority facts.
- `operational_work_assignments` stores named-employee or position delegation, due and follow-up dates, evidence expectations, verification requirements, and assignment status.
- `operational_work_postponements` requires a structured reason, explanation, and resume or review date.
- `operational_work_dependencies` records blocker/dependent edges and prevents self and circular relationships.
- `operational_work_leadership_handoffs` records recipient/group, reason, decision requested, sent/response/follow-up dates, references, response, and outcome.
- `operational_work_evidence` and `operational_work_events` are append-only history.

All commands derive the actor from `auth.uid()`. Direct client writes to the workflow tables are revoked. Workflow reads use row-level security and are limited to active managers, responsible employees, accountable managers, and existing source ownership rules.

Delegation supports `awaiting_acceptance`, `accepted`, `in_progress`, `needs_clarification`, `submitted_for_verification`, `completed`, `reassigned`, and `overdue`. Overdue presentation is also derived from the delegation due date, so it does not rely on a background scheduler.

When a blocker completes, database triggers reactivate dependents only after the blocker satisfies its verification requirement. The trigger closes the matching postponement, resolves the dependency, restores the dependent to active when no other wait state remains, and appends a visible automatic-reactivation event.

A leadership handoff does not complete the originating record when it is sent. A recorded approved/completed outcome may complete only a supported source, and it does so through that source's strongest lifecycle command in the same transaction.

## Program Standards

Program Standards now record:

- not started, partially complete, complete, and not applicable status;
- a required explanation for not applicable;
- editable local duration estimates and impact level;
- an optional manager target date, explicitly separate from an official deadline;
- optional evidence references;
- version, evaluation, event, and evidence history;
- explicit reopen behavior.

The standards catalog may be completed in any order. Direct browser writes are disabled; progress and delegation use audited RPCs.

## Explainable priority and actions

`src/lib/operational-work/priority.ts` calculates a deterministic score using overdue age, due proximity, safety, compliance, payroll and financial deadlines, blocked dependents, short-duration quick wins, Program Standard impact, and an audited manager override. Stable ID is the final ordering tie-breaker. Every card renders the explanation used to rank it.

Cards expose the live destination and the actions allowed for the current actor: open, start, accept, request clarification, delegate, postpone, mark blocked, add/remove dependency, send to leadership, record leadership response, attach evidence, submit for verification, complete, verify, set priority, and reopen.

## Acceptance coverage

The implementation includes unit coverage for priority boundaries, stable ordering, aggregation, deduplication, deep links, completed-recently bounds, derived overdue delegation, route consolidation, security contract, and compact-card actions. The disposable-local SQL matrix covers RLS, actor attribution, named and position delegation, assignment transitions, postponement validation, self/circular dependency rejection, verification-gated reactivation, leadership outcomes, Program Standards progress/evidence/history, direct-write denial, and immutable history.
