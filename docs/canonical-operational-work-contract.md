# Canonical operational work contract

## Purpose

The command center consumes one complete projection contract. Source adapters must provide every field; UI cards must not infer missing source semantics.

The TypeScript authority is `src/lib/operational-work/types.ts`.

## Identity and source

| Field | Meaning |
| --- | --- |
| `stableId` | Durable workflow key. Examples: `task:<uuid>`, `standard:<uuid>`, `obligation:<uuid>:<period>`. |
| `sourceType` | `task`, `duty`, `standard`, `obligation`, `goal`, `step`, `calendar`, `equipment`, `purchase_request`, or `inspection`. |
| `sourceRecordId` | UUID of the authoritative source record. |
| `destinationRoute` | Live deep link to the source workflow. |
| `sourceLabel` | Human-readable provenance shown on the card. |

`stableId` is the deduplication key, dependency key, workflow-state key, and final deterministic ordering tie-breaker. A duty occurrence uses its task ID because `tasks` remains its execution record.

## Content, ownership, and accountability

| Field | Meaning |
| --- | --- |
| `title`, `description` | Source-owned work description. |
| `department` | Recorded or deterministic source department; nullable when not known. |
| `responsibleEmployee` | Normalized employee identity when responsibility resolves to a named person. |
| `responsiblePosition` | Recorded position or role delegation. |
| `accountableManager` | Manager accountable for the cross-source workflow. |
| `delegated`, `delegationStatus` | Whether active delegation exists and its current status. |

A position delegation may resolve to an active employee for execution while preserving the requested position. The database, not the browser, records the assigning and transition actors.

## Time, priority, and classification

| Field | Meaning |
| --- | --- |
| `dueDate` | Authoritative due date or local manager target date. |
| `estimatedMinutes` | Recorded estimate; Program Standard defaults are explicitly local planning estimates. |
| `priorityBand`, `priorityScore` | Deterministic presentation band and numeric score. |
| `priorityExplanation` | Ordered facts that explain the score. |
| `impactLevel` | Local impact classification when supported. |
| `managerPriorityOverride` | Audited bounded numeric adjustment. |
| `safetyFlag`, `complianceFlag`, `payrollDeadlineFlag`, `financialDeadlineFlag` | Explicit priority facts. |
| `dependentCount` | Number of active work items blocked by this item. |

The priority engine never uses randomness or an opaque model call. Given the same item facts and facility date, it returns the same score, explanation, band, and order.

## Lifecycle, waits, and verification

| Field | Meaning |
| --- | --- |
| `status` | `pending`, `awaiting_acceptance`, `in_progress`, `postponed`, `blocked`, `waiting_leadership`, `needs_verification`, `completed`, `verified`, or `cancelled`. |
| `blockedState` | Visible blocked flag, blocker stable IDs, and reason. |
| `waitingReason`, `reviewDate` | Structured postponement reason and next accountability date. |
| `leadershipState` | Active handoff status, recipient/group, follow-up date, and whether follow-up is due. |
| `verificationState` | `not_required`, `required`, `needs_verification`, or `verified`. |
| `aiCapabilityState` | `available`, `not_available`, or `unknown`; it does not imply autonomous execution. |
| `activitySummary` | Latest visible audited event summary. |

Projection state cannot override a terminal authoritative source record. Completing or verifying a work item calls the strongest source lifecycle in the same database transaction. Program Standards use their dedicated progress command so evaluation and version history are never bypassed.

## Audit timestamps and linkage

| Field | Meaning |
| --- | --- |
| `createdAt`, `updatedAt`, `completedAt` | Source timestamps used for display, recency, and deduplication. |
| `programStandardId` | Optional link between source work and a Program Standard. |

Completed records remain eligible for the `Completed recently` section for fourteen days. Older terminal records are excluded from the operational projection but remain in their authoritative history.

## Adapter rules

1. Do not create a second authoritative task row merely to display another source.
2. Preserve source-specific lifecycle and privacy rules.
3. Build `stableId` from recorded identity, never from a title or array index.
4. Map all fields explicitly; use `null` or `unknown` when a fact is not recorded.
5. Apply active workflow overlays after source normalization.
6. Prefer terminal source state over non-terminal overlay state.
7. Dedupe on `stableId`, keeping the newest projection.
8. Score after overlays so current due dates, blockers, leadership, and manager facts affect priority.
9. Partition each item into exactly one primary section.
10. Deep-link to a live source route; never render a dead or placeholder action.

## Security contract

Authenticated users may select workflow rows only when `can_read_operational_work(work_key)` permits it. Direct insert, update, and delete privileges are revoked for `anon` and `authenticated`. Approved security-definer commands validate role, source existence, transition, required fields, and source authorization, then derive actor fields from `auth.uid()`.

Events and evidence are append-only. Ended postponements, resolved dependencies, and completed/reassigned assignments cannot be rewritten or deleted. Reopening a completed task creates a linked successor task so original completion history remains intact.
