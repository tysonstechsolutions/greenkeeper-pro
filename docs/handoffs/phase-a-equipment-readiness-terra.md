# Terra Implementation Handoff — Phase A: Equipment Readiness Dashboard

**Prepared:** 2026-07-12 by Fable · **Approved scope:** Phase A ONLY (readiness visibility layer)
**Parent design:** `docs/plans/2026-07-12-equipment-pm-readiness-engine-design.md`
**Repo baseline:** `main` @ `e7bb0d1` (clean; 687/687 tests green)

This document is self-contained — you do not need the conversation that produced it.

---

## Task title
Equipment Readiness Dashboard — the first fleet-level equipment command center, built ONLY from data that already exists.

## Business objective
The GM runs Veterans Memorial Golf Course without a superintendent. The mowing fleet being down is the operation's #1 documented constraint, but fleet status currently lives in one person's head and 117 scattered `equipment` rows. One screen must answer: **what do we own, what's operational, what's down, what's waiting on parts, what has repair costs, what needs attention today.**

## Hard scope guards (from the GM — do not cross)
- ❌ **No PM-scheduling logic** (no interval math, no "due soon" prediction)
- ❌ **No engine-hour calculations** (fields exist but are empty; render only, never compute)
- ❌ **No new tables, columns, migrations, or data writes** — this is a **read-only** feature
- ❌ **Never invent equipment data** — empty means "not recorded yet," shown honestly

## Current behavior
There is no fleet view. `/equipment/view?id=<uuid>` shows one unit (route kept when the old list page was deleted — see `src/lib/layout/app-catalog.ts:62-63` header comment). `useEquipment()` (`src/lib/hooks/useEquipment.ts`) loads units but **caps at `limit: 100`** — the live fleet is **117 units**, so the hook as-is silently drops 17. Operational asset data also surfaces on `/assets` (fy26 inventory), which stays untouched.

## Live data reality (verified against production 2026-07-12 — design around it, don't "fix" it)
| Fact | Value | Consequence for you |
|---|---|---|
| Non-retired units | **117** | The 100-row cap must be avoided |
| Status spread | **58 operational / 59 out_of_service**; 0 needs_service, 0 in_repair | Down tile = 59 on day one |
| `needs_parts_ordered` | **all false**; `equipment_parts` table has **0 rows** | Waiting-on-parts t