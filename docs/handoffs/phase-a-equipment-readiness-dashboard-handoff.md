# Terra Implementation Handoff — Equipment Readiness Dashboard (Phase A)

**Prepared:** 2026-07-12 by Fable · **For:** Terra · **Status:** Ready to build
**Parent design:** `docs/plans/2026-07-12-equipment-pm-readiness-engine-design.md`
**Repo baseline:** branch `main` @ `e7bb0d1` (clean). Auto-commit when done; **never `git push`** (Tyson deploys).

---

## Task title
Equipment Readiness Dashboard — the first usable equipment command center, built from **existing data only**.

## Business objective
Give the GM (who has no superintendent) one screen that answers, at a glance:
- What equipment do we own?
- What is operational?
- What is down?
- What is waiting on parts?
- What has repair costs / service history?
- What needs attention today?

## Scope guardrails (READ FIRST — do not cross these)
This phase is the **visibility layer only**. Do **NOT**:
- ❌ Add PM scheduling logic, service-interval math, or "overdue for service" calculations from intervals.
- ❌ Add engine-hour / usage-rate / prediction calculations.
- ❌ Create new tables, columns, views, or migrations.
- ❌ Invent, seed, or backfill any equipment data.
- ❌ Add write/edit actions (this is read-only; editing stays on `/equipment/view`).

Everything above is Phase B+ and belongs to Fable. If you feel you need any of it to finish Phase A, stop and flag it — you don't.

---

## ⚠️ Ground truth about the live data (verified 2026-07-12 — this shapes the whole build)

There are **117 non-retired equipment rows**. Field population **right now**:

| Field | Populated? | Consequence for the dashboard |
|---|---|---|
| `status` | ✅ **58 operational / 59 out_of_service** | The Operational and Down tiles work today. |
| `name`, `model`, `fuel_type` | ✅ complete | Safe to display. |
| `make` | ⚠️ ~half missing | Show `make` when present, else fall back to `model`. |
| `equipment_type` | ⚠️ **91 of 117 are `"other"`** | The type filter is weak; keep it but don't rely on it. |
| `equipment_service_records` | ⚠️ **51 rows, but 0 have a cost** | "Repair costs" shows **service-history presence/dates**, NOT dollar amounts (there are none yet). |
| `needs_parts_ordered` | ❌ **0 units** | "Waiting on parts" tile reads **0 today** — this is correct, not a bug. |
| `parts_needed`, `estimated_repair_cost`, `next_service_due_date`, `condition_status` repair flags, `location` | ❌ **0 populated** | Do not build features that assume these exist; render their absence cleanly. |

**The core instruction:** the dashboard must be **correct and honest when almost everything is empty**. Several tiles will legitimately read zero. Empty states must look intentional and must never fabricate a number. As Tyson enters data over time, the same tiles fill in with no code change. **Empty-state behavior is the most important part of this task, not an afterthought.**

---

## 1. Exact files Terra should modify / create

**Create:**
- `src/app/equipment/page.tsx` — the dashboard route (new; there is currently no `/equipment` index — only `/equipment/view` and `/equipment/service-history-view` exist).
- `src/lib/equipment/readiness.ts` — a **pure** helper that buckets a unit into a readiness category. No I/O, no hooks. Unit-testable.
- `src/__tests__/unit/equipment/readiness.test.ts` — tests for the helper.
- (Optional) `src/components/features/equipment/readiness-tile.tsx` and `unit-row.tsx` if it keeps `page.tsx` clean — your call.

**Modify:**
- `src/lib/layout/app-catalog.ts` — add one `AppEntry` for the dashboard (see §9). This is the **only** nav file to touch (menus are catalog-driven).
- `src/lib/hooks/useEquipment.ts` — **one required change:** `fetchEquipment` currently passes `limit: 100`. There are 117 units, so **raise the limit to at least 500** (or make it a parameter) or the dashboard silently drops 17 units. Do not change anything else in the hook.

**Do not modify:** any migration, any other hook, `/equipment/view`, or `types/database.ts`.

## 2. Existing tables / components / code to reuse
- **Hook:** `useEquipment()` (`src/lib/hooks/useEquipment.ts`) — `fetchEquipment(filters)` returns the full `Equipment[]`; `EquipmentFilters = { type?, status?, search? }` already supports server-side status/type/search filtering. Reuse its exported `equipmentStatusLabels`, `equipmentStatusColors`, `equipmentTypeLabels`.
- **Service records:** `useEquipmentServiceRecords` (`src/lib/hooks/useEquipmentServiceRecords.ts`) — for the "has service history" signal (count / latest date per unit). Fetch once for all units if it supports it; otherwise derive lazily. Do **not** N+1 fetch per unit on the list.
- **Detail link target:** `/equipment/view?id=<uuid>` (it reads `searchParams.get("id")`).
- **Today section pattern:** `src/app/today/page.tsx` (the `ObligationRow` list layout) — match its visual grammar for the "needs attention" list.
- **Layout/theming:** `HubPage` / `WorkspaceLanding` in `src/components/layout/`; **theme tokens only** (`bg-card`, `text-muted-foreground`, `border-border`, etc.) — never hard-coded `bg-white`/`bg-gray-*` (see the theme-tokens convention). Status chips must use **color + text**, never color alone (accessibility).

## 3. Screens / components required
A single dashboard page with three stacked regions:

**(a) Fleet summary — count tiles (color+label+text):**
| Tile | Definition (from existing fields only) |
|---|---|
| **Total owned** | count of non-retired equipment (117 today) |
| **Operational** | `status = 'operational'` |
| **Down** | `status IN ('out_of_service','in_repair')` |
| **Needs service** | `status = 'needs_service'` (status-only — NOT computed from intervals) |
| **Waiting on parts** | `needs_parts_ordered = true` (reads 0 today — show empty gracefully) |

**(b) Needs attention today:** a short list, highest concern first — down units (`out_of_service`/`in_repair`), then `needs_service`, then `needs_parts_ordered`. If all clear, a positive empty state ("Nothing needs attention — all tracked equipment is operational"). Derived **only** from `status` + `needs_parts_ordered`; no date/interval logic.

**(c) Unit list:** filterable rows. Each row: name · status chip · type (skip if `"other"`) · `make model` (or `model` if make missing) · a "has service history" indicator (e.g. "3 services · last May 2026") when records exist. Row → `/equipment/view?id=<id>`. **No repair dollar figure** (none exist); if you show a cost column at all, show it only for units whose service records carry a non-null cost — today that's none, so omit or empty-state it.

## 4. Data queries needed
- **Primary:** `fetchEquipment()` with the raised limit → all 117 non-retired units in one call. Tiles and the list are computed client-side from this array via `readiness.ts` (117 rows is trivial; no view, no pagination needed).
- **Service history signal:** one bulk read of `equipment_service_records` (id, equipment_id, service_date, cost) → reduce to per-unit `{ count, latestDate, hasCost }`. One query, not per-row.
- Filtering can be client-side over the loaded array (simplest, 117 rows) **or** via the hook's existing server filters — either is acceptable; client-side avoids refetch flicker.
- **No aggregate/rollup queries, no new endpoints.**

## 5. Filters needed
- **Status** (All / Operational / Needs service / In repair / Out of service) — the primary, reliable filter.
- **Search** (name / make / model) — hook already supports it.
- **Type** — include but de-emphasize (91/117 are `"other"`; note this in a comment so nobody thinks it's broken).
- **"Needs attention only"** toggle — quick filter to the down/needs-service/parts subset.
Persisting filter state in the URL is nice-to-have, not required.

## 6. Permissions considerations
- Standard authenticated kiosk model — no role gating needed (RoleGuard is pass-through). Reads go through the authenticated client like every other page.
- **Do not** reintroduce anon access or touch RLS (Phase 0B locked anon out; leave it). This page is read-only and needs only the existing authenticated `equipment` / `equipment_service_records` SELECT.

## 7. Empty-state behavior (the heart of this phase — PM data is incomplete)
Handle each independently; none should ever render as an error or a fake value:
- **Waiting-on-parts tile = 0:** show "0" calmly, or "No parts on order" — never hide the tile, never imply a problem.
- **Needs-service tile = 0:** same. Do **not** compute "overdue" from intervals to fill it (that's Phase B).
- **A unit with no hours / no interval / no next-service-date:** show "—" or "Not tracked yet", not "0 h" or "overdue".
- **A unit with no service records:** "No service history yet." No cost shown.
- **Cost data absent everywhere:** the dashboard must not display `$0.00` as if it were real. Prefer "No cost recorded" or omit the figure.
- **All-clear attention list:** a friendly positive state, not a blank box.
- **Zero equipment (defensive):** "No equipment on file."
A short banner is acceptable, e.g. *"Hours and service schedules aren't tracked yet — add them per unit to unlock maintenance predictions (coming soon)."* Keep it factual; don't promise dates.

## 8. Tests required
`src/__tests__/unit/equipment/readiness.test.ts` (pure helper — the priority):
- `operational` → Operational tile only.
- `out_of_service` and `in_repair` → Down.
- `needs_service` → Needs-service.
- `needs_parts_ordered = true` → Waiting-on-parts (independent of status; a unit can appear in Down **and** parts).
- `retired` → excluded entirely.
- A unit with null hours/interval/next-service-date → **never** classified "overdue" (guards against Phase-B logic leaking in).
- Attention-list ordering: down before needs-service before parts.
- `make` missing → display falls back to `model`.

Component smoke test (if your setup renders it easily): dashboard mounts with a mocked 117-unit array, tiles sum to total, list links carry the right `?id=`. Match the existing component-test style under `src/__tests__/`.

Also run and keep green: `npm run typecheck`, `npm run lint` (0 new problems), `npm run test:run` (currently 687 passing).

## 9. Nav entry (app-catalog.ts)
Add one entry near the equipment/assets group. Suggested:
```
const EQUIPMENT: AppEntry = { href: "/equipment", label: "Equipment", icon: Wrench,
  color: "from-amber-500 to-yellow-600", group: GROUPS.course };  // or GROUPS.money — match where assets live
```
Pick the icon from the existing lucide imports already in the file; place it in whichever group the team files fleet/asset tools (Course & Range is the natural home for the readiness board; confirm against the current GROUP usage in the file). Add it to the appropriate role catalog array exactly as neighboring entries are added — do not restructure the catalog.

## Acceptance criteria
- [ ] `/equipment` renders all **117** non-retired units (proves the `limit` fix landed — not 100).
- [ ] Five tiles compute correctly from existing fields; **Operational (58) + Down (59)** reconcile to the live status counts; Waiting-on-parts shows 0 **without looking broken**.
- [ ] No tile or row displays a fabricated hour, interval, due-date, or dollar figure. Absent data reads as "—" / "Not tracked yet" / "No cost recorded".
- [ ] "Needs attention today" lists down/needs-service/parts units in that priority; all-clear shows a positive empty state.
- [ ] Rows link to `/equipment/view?id=<uuid>`.
- [ ] Status/search filters work; type filter present but not relied upon; "needs attention only" toggle works.
- [ ] `readiness.ts` is pure and fully covered by the tests above; no interval/hour/prediction logic anywhere in the diff.
- [ ] One nav entry added via `app-catalog.ts`; no other nav file touched.
- [ ] typecheck + lint clean; **687 existing tests still pass**; new tests pass.
- [ ] No new tables/columns/migrations; no writes; anon access untouched.

## Out of scope (Phase B+, Fable)
Meter readings, PM schedule items, service-interval/engine-hour math, "overdue" prediction, repair workflow, cost-per-hour & downtime rollups, replacement planning, Financial Watch integration.

## Risks & rollback
- **Risk:** low — additive read-only route + one helper + one nav line + one hook-limit bump.
- **The one behavioral change outside the new files** is the `fetchEquipment` limit. Confirm no other caller depends on the 100 cap (it's a safety limit, so raising it is safe) and note it in the commit.
- **Rollback:** delete `src/app/equipment/page.tsx`, `src/lib/equipment/readiness.ts`, the test file, revert the one-line catalog entry and the hook-limit change. No data or schema to undo.

## Return to Fable
Commit (don't push) and report: branch/commit, files changed, test results (typecheck/lint/unit counts), a note confirming the tile counts matched live status (58/59), and any field you found even sparser than documented here.
