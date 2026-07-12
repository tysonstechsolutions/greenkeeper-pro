# GreenKeeper Pro — Current-State Audit

**Date:** 2026-07-11 · **Baseline commit:** `f7880e5` (clean working tree, branch `main`)
**Scope:** Repository-wide, read-only. Produced against the GreenKeeper Pro master specification (Veterans Memorial Golf Course turnaround system).
**Method:** Full-repo inspection — 116 routes, 111 migrations, 26 edge functions, 74 test files — plus existing docs (`docs/OPERATION-BLUEPRINT.md`, `MASTER_PLAN.md`, `audit-report.md` of 2026-04-24, `SECURITY.md`).

---

## 0. Verification baseline (recorded this run)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ 0 errors |
| `npm run test:run` | ✅ 74 files, **687/687 tests pass** (10.6s) |
| `npm run lint` | ⚠️ 7 errors + 1,517 warnings — **all 7 errors are in the vendored minified `public/vendor/pdf.worker.min.mjs`** (should be an ESLint ignore); warnings are dominated by `no-explicit-any` in Deno edge functions |
| Working tree | Clean; no uncommitted changes |
| Prior route audit (2026-04-24, `audit-report.md`) | 178/178 page loads, 0 hydration errors, 0 overlap |

**Rollback plan for any future change:** clean git history on `main`; every phase lands as narrowly-scoped commits; Tyson controls push/deploy. Database changes are hand-applied via the Supabase Management API, so any migration must ship with a commented rollback block (the `20260422_*` convention).

---

## 1. Executive assessment

**This is not a greenfield project.** Roughly 70% of the master specification's *software* scope already exists, works, and is tested. The application has been through five build phases (Operation Blueprint, completed 2026-07-03) plus continuous feature work since. The correct posture is: verify, harden, and fill specific gaps — not rebuild.

### What is already strong
- **Information architecture** matches the real business: five workspaces (Course & Range, Restaurant, Pro Shop, Money, People) + `/today` daily command center, all driven from one nav catalog (`src/lib/layout/app-catalog.ts`).
- **The daily command center exists** (`/today`): overdue/due-soon obligations, expiring certifications, standing duties by area, My Day tasks, week-ahead calendar — exactly the master spec's §18 core.
- **A real recurrence/obligations engine** (`src/lib/operations/engine.ts` — deterministic, unit-tested, misses stay visible oldest-first) plus My Day recurring tasks with end-of-month-aware rollover (`src/lib/my-day/recurrence.ts`).
- **Financial discipline is architecturally enforced**: deterministic engines compute (Financial Watch, per-area P&L over server-side rollup views, PR cost-center rollups); AI only narrates. Monthly rollup views exist specifically to dodge PostgREST's 1,000-row cap.
- **Procurement is deep**: PR creation with 889 tracking, quote extraction with tax-rejection gate (`src/lib/quote/tax-check.ts`), 3% CC fee rule, SOW/sole-source generators, PR audit with per-cost-center monthly budgets, PR reconciliation (submitted vs actual), disposition packets (DD-200/2212).
- **AI guardrails are genuinely implemented**, not aspirational: verify-then-commit intake tools, snapshot-is-data-not-instructions injection defenses, temperature-0 transcription extractors that forbid "correcting" codes, library-first reuse before paid calls, all 17 AI functions on a swappable `ANTHROPIC_MODEL` env.
- **Engine-level test coverage is excellent** (687 passing tests over the pure logic: PR audit, quote extraction, financial watch, recurrence, forms).

### What is incomplete (real gaps vs the master spec)
| Master-spec area | Status |
|---|---|
| §10 Equipment PM engine (manufacturer-interval, meter-hour-triggered service tasks) | Partial — service records/parts exist; no hour-meter-triggered PM generation, no readiness board, no cost-per-hour |
| §11 Golf-shop retail SKU system (margin, sell-through, weeks-of-supply, markdowns) | Not built — only hand-count inventory + revenue uploads (deliberate: blueprint chose hand-count first) |
| §12 Simulator business case | Not built — only an annual obligation seed ("simulator setup, Nov") |
| §13 Menu engineering / recipe costing | Not built — restaurant has inventory counts, US Foods purchases, duty log only |
| §9 Mowing-direction rotation & irrigation decision support | Designed (`docs/plans/2026-06-09-…`, watering schedule exists) but rotation engine unbuilt |
| §6 Review-theme analysis / §14 staffing-market analysis | Not built (research deliverables, mostly non-code) |
| §16 Revenue targets | Stubbed: `financial-watch/engine.ts:514` `hasTarget = false // no revenue-target system yet` |
| Audit trail | `activity_log` table exists but **nothing writes to it** — `SECURITY.md` overstates this |

### Largest operational risk
**The live database and the migration folder are not provably in sync.** Migrations are hand-applied via the Management API; the folder is a log of intent, not applied history. There is direct in-repo evidence of past drift (`20260419_fix_fy26_assets_rls.sql` exists *because* an earlier migration was never applied; `005_missing_tables.sql` and `20260419_add_polls.sql` both `CREATE TABLE poll_votes` without `IF NOT EXISTS` — both cannot have applied). Nothing else in this audit can be fully trusted until schema truth is verified against the live DB. Second: **backups are provider-default only** — no restore has ever been tested, and this app is now the operation's system of record.

### Largest financial opportunity
Per Tyson's own `MASTER_PLAN.md`: revenue is $100–300k against $400–600k potential, and the gap is course condition + unstructured revenue programs (events calendar, memberships, range). The app can support this most directly by (1) making the equipment fleet recovery visible and scheduled (PM engine — every week a mower is down costs conditions), (2) the winter simulator business case (new revenue stream, decision due before November), and (3) revenue targets in Financial Watch so pace vs goal is visible weekly.

### What should NOT be built yet
- Golf-shop SKU/markdown system — blocked on real sales granularity (only monthly revenue sheets exist as authoritative source; per-SKU sell-through needs data that doesn't exist yet).
- Menu engineering — blocked on menu, recipes, portion standards, plate costs (none in the app).
- Simulator procurement recommendations with model numbers/prices — needs current-market research **at decision time** plus room dimensions/electrical/IT-approval answers; premature now.
- Any pesticide-application logic — nonnegotiable #6; contractor performs applications (note: `MASTER_PLAN.md` says Tyson is pursuing an applicator license — until confirmed licensed, the constraint stands).
- Per-user auth/roles — Tyson deliberately flattened to a single shared account (2026-07-03, commit `b1592f7`). Do not re-add without his decision.

### Requires immediate action (this phase)
1. Live-DB schema verification (read-only drift check) — everything else depends on it.
2. Storage hardening completion — the photos bucket is public with unsigned, non-expiring URLs; migration `20260422_p0b` explicitly deferred this ("P3 signed-URL migration" never happened). Course photos are low-sensitivity, but staff-document uploads must be confirmed to NOT be in a public bucket.
3. Make `SECURITY.md` honest (audit trail claim) or make the claim true (populate `activity_log` from the app's write paths).
4. Backup restore test — document and perform one restore drill against a scratch Supabase project.
5. Trivial hygiene: ESLint ignore for `public/vendor/`, stale `README.md`/`docs/database.md` banners pointing to current truth.

---

## 2. Architecture map

```
┌────────────────────────────── Clients ──────────────────────────────┐
│  Vercel static site (next.config: output "export")   Capacitor APK │
│  PWA + Serwist offline queue      single shared Supabase account   │
│  (NEXT_PUBLIC_APP_EMAIL/PASSWORD auto-sign-in; PIN 9999 soft gate) │
└──────────────┬──────────────────────────────────────┬──────────────┘
               │ supabase-js (RLS: authenticated)     │ fetch
┌──────────────▼──────────────┐        ┌──────────────▼──────────────┐
│  Supabase Postgres          │        │  26 Edge Functions (Deno)   │
│  ~90 tables, 3 rollup views │        │  17 AI (ANTHROPIC_MODEL     │
│  RLS: authenticated-only    │        │   env, 45–60s timeouts,     │
│  (kiosk model — no per-user │        │   getUser→401)              │
│   row filtering)            │        │  pin-login (rate-limited),  │
│  pg_cron → daily-briefing   │        │  push, weather proxy, etc.  │
└─────────────────────────────┘        └─────────────────────────────┘

Frontend layering (src/):
  app/            116 pages, 8 hub landings, /today command center
  lib/layout/     app-catalog.ts = SINGLE source of nav truth
  lib/<domain>/   PURE DETERMINISTIC ENGINES (no I/O, injected clock):
                  operations/engine.ts (obligations), my-day/recurrence.ts,
                  financial-watch/engine.ts, money/area-pnl.ts,
                  pr-audit/rollup.ts, quote/tax-check.ts, people/certs.ts
  lib/hooks/      Supabase data hooks (use* per domain)
  lib/reports/    ~35 PDF generators (pdf-lib + official form rasters)
  lib/ai/         library-first reuse → paid AI → offline fallback
```

**Key architectural invariants to preserve:**
1. Deterministic engines compute; AI narrates. Never let AI invent figures.
2. Aggregates come from server-side rollup views, never raw-row client fetches (PostgREST max_rows=1000).
3. All nav edits go through `app-catalog.ts`.
4. Migrations are idempotent, hand-applied, and ship with commented rollback blocks.
5. Verify-then-commit for every AI write tool that touches money/schedule/people.
6. Static export — no Next middleware/API routes; all server logic is edge functions.

---

## 3. Feature inventory

Status legend: ✅ working+tested · 🟡 working, thin/partial · 🔴 missing · 📐 designed-not-built

| Area | Existing capability | Status | Data source | Risk | Missing capability | Recommended action |
|---|---|---|---|---|---|---|
| Daily command center | `/today`: obligations, cert alarms, duties, My Day, week ahead | ✅ | obligations/duties/certs tables | Low | GM overload warning (labor-hours vs available) | Add workload strip later (Medium) |
| Recurring tasks | My Day recurrence + rollover; obligations engine (monthly/quarterly/annual, lead days) | ✅ | daily_goals, obligations | Low | Hour-meter/condition-triggered cadences | Extend engine (High, Fable) |
| Calendar | `/calendar` month view; events + task deadlines + 1:1s + tournaments | ✅ | calendar_events + aggregation | Low | — | Keep |
| Grounds ops | Course map w/ 103 issues, greens observations, resolution history, watering schedule, spray windows, duty log | ✅ | hole/green_observations, watering_plans | Low | Mowing-direction rotation (📐 designed 2026-06-09) | Build per design after superintendent validation |
| Irrigation | Sprinkler map, stations/valves/issues, auto-staggered schedule | ✅ | irrigation_* tables | Low | ET-based decision support | Defer until water restored (NAVFAC) |
| Equipment/assets | Asset registry (211 FY26 items), barcode scan, DPAS import, disposals, service records, parts, order list | 🟡 | fy26_assets, equipment_* | Med | PM engine (manufacturer intervals, meter hours), readiness board, cost-per-hour, 5-yr replacement plan | **Build — top backlog item** |
| Procurement | PR create (tax gate, 3% fee, 889), PR audit + cost-center budgets, reconciliation, SOW/sole-source, vendors, disposition packets | ✅ | purchase_requests (JSONB items), pr_audits | Med (JSONB cost_ctr integrity) | Formal §7 gate checklist stages; mandatory-source checks | Add cost-ctr validation now; gate checklist High |
| Money/P&L | Per-area P&L (rollup views), Financial Watch, budgets, fuel log, revenue uploads (vision extract) | ✅ | rollup views | Low | Revenue targets (stub at engine.ts:514); 13-week outlook | Build targets (High) |
| Restaurant | Inventory hand-counts, US Foods purchases→P&L, duty/cleaning log, spreadsheet upload | 🟡 | inventory_*, restaurant_purchases | Low | Recipe costing, menu engineering, pars-from-usage, winter daypart contribution | Blocked on menu/recipe data from Tyson |
| Pro shop | Inventory hand-counts, scheduler (patterns, duties, warning triage), revenue uploads | 🟡 | pro_shop_*, inventory_* | Low | SKU/margin/sell-through/markdowns | Blocked on per-SKU sales data |
| Staff/HR | Roster, profiles + doc-vision autofill, tracking timeline, concerns/1:1s, SF-52 filler, onboarding SOP packets, certifications w/ 60-day alarms | ✅ | profiles, staff_*, certifications | Low | Position/staffing analysis, hiring workflow, compensation research | Mostly research deliverables, not code |
| Paperwork | SOW, sole source (page-2 complete), SF-52 (real encrypted PDF), DD-200/2212, saved-documents store | ✅ | created_documents | Low | — | Keep |
| AI | Workspace assistant bar (26 tools, verify-then-commit), financial advisor, 8 vision extractors, AI library reuse | ✅ | ai_library, ai_conversations | Low | Per-user rate limiting on AI functions | Low priority given single-user reality |
| Compliance | AST inspections, environmental logs, Illinois RUP reports, REI conflict warnings, 889 tracking | ✅ | ast_inspections, environmental_logs | Low | Contractor pesticide-visit tracker (dates, areas, REI, service reports) as first-class record | High — small, allowed by nonnegotiable #7 |
| Reviews/customers | — | 🔴 | — | — | Review-theme tracker + corrective-action workflow (§6) | Medium; needs Tyson's list of platforms |
| Simulators | Annual "setup" obligation seed only | 🔴 | — | — | Full §12 business case | Research task, gated on facility answers |
| Security/ops | RLS hardening pass (2026-04-22), CSP headers, secrets clean, push, Sentry | 🟡 | — | **High** | Signed URLs, populated audit log, restore drill, RLS drift re-check | **Phase 0 of this effort** |

**Dead/legacy surface (small):** redirect stubs (`/schedule/morning`, `/settings/invite`, `/`), orphaned `/irrigation` hub landing, legacy `/equipment/view` + `/equipment/service-history-view` detail pages, hidden-by-design `/tasks/*`. Poll/community/tee-time tables from `005_missing_tables.sql` likely unused since the 2026-06-28 nav cleanup — candidates for confirmation-then-archive, **not** deletion (nonnegotiable #10).

---

## 4. Risk register

| # | Risk | Severity | Evidence | Mitigation (owner) |
|---|---|---|---|---|
| R1 | Migration-folder vs live-DB drift; folder is intent-log, not applied history | **High** | `20260419_fix_fy26_assets_rls.sql` self-describes prior non-application; duplicate `CREATE TABLE poll_votes` in `005` + `20260419_add_polls.sql` | Read-only drift-check script against live DB (Fable, Phase 0) |
| R2 | No tested backup/restore; app is now system of record | **High** | No backup tooling in repo; `SECURITY.md:206` relies on provider defaults | Documented restore drill to scratch project (Tyson + Fable script) |
| R3 | Public photos bucket, unsigned non-expiring URLs; staff-doc bucket posture unverified | **High** (if staff docs public) / Med (course photos) | `20260422_p0b` part (b) explicitly deferred; `storage.ts` uses `getPublicUrl` only | Verify bucket-by-bucket; signed URLs for sensitive buckets (Fable) |
| R4 | `SECURITY.md` claims an audit trail that nothing writes | Med | `activity_log` has zero insert sites in `src/` or edge functions | Populate from key write paths or correct the doc (Fable decision + handoff) |
| R5 | PR line-item `cost_ctr` is free JSONB — typo ⇒ silent orphan P&L bucket | Med | `pr_spend_monthly_rollup` groups by `line->>'cost_ctr'`, no FK to `pr_codes` | Validate at entry against `pr_codes`; orphan-bucket report (handoff) |
| R6 | RLS pattern drift: post-hardening tables reintroduce `USING(true)` FOR ALL; re-running `p0a` would drop them | Med (acceptable under kiosk model, fragile) | `20260702_operating_rhythm.sql:87`, `20260703_inventory_fnb.sql:66` | Document the deliberate kiosk policy shape; never re-run `p0a` blind |
| R7 | Shared credentials ship in the client bundle (`NEXT_PUBLIC_APP_EMAIL/PASSWORD`); PIN is client-side | Accepted | Tyson's explicit 2026-07-03 decision (single view, no roles) | Record as accepted risk; revisit only if non-Tyson users get real access |
| R8 | E2E coverage is smoke-only; no functional flows; auth spec disabled | Med | `playwright.config.ts` testIgnore; only `route-audit.spec.ts` | 5–10 critical-flow e2e specs (handoff) |
| R9 | `pr_spend_monthly_rollup` reconciliation scaling silently falls back when `ige_amount` null/0 | Low-Med | `20260702_money_rollups.sql:27-43` | Surface unscaled-PR count in Money UI (handoff) |
| R10 | Sentry replay `maskAllText:false` could capture personnel/financial text | Low | `sentry.client.config.ts` | One-line config change (handoff) |
| R11 | Stale docs mislead future work (`README.md` roles/migrations, `docs/database.md` at migration 004) | Low | README lists 8-role model that no longer exists | Doc refresh (handoff) |
| R12 | Obligation period-key logic duplicated in edge fn (`periodKeyFor`) and `operations/engine.ts` | Low (verified consistent today — both use `annual`) | ai-assistant `index.ts:536` vs `engine.ts` | Comment cross-reference both sites; sync test (handoff) |

---

## 5. Questions requiring answers

Only questions **not** answerable from the repo, memory, or prior worksheets. The Operation Blueprint's five open questions from 2026-07-02 are still outstanding and lead the list.

### Carried over (still unanswered from the blueprint)
1. **Asset-inventory submission dates** per FY schedule (maint / F&B / pro shop) — needed to seed the obligations that keep them from being missed.
2. **US Foods delivery day** — sets the order-day anchor in the weekly rhythm.
3. **Fire-extinguisher duty delegate** when staff join the app.
4. **A sample RecTrac/GolfNow end-of-period report** — the revenue extractor was built against assumptions; a real sample validates the categories.
5. **DPAS export** from the government computer — unblocks full asset reconciliation in `/assets/import`.

### Grounds & equipment
6. **Applicator license status** — `MASTER_PLAN.md` says you were pursuing it. If you're now licensed, nonnegotiable #6 (no pesticide logic) changes scope materially; if not, we build only the contractor-visit tracker. *Determines an entire module's legality of scope.*
7. **Current equipment meter hours + which manuals you have** (PDF or paper) for the units the mechanic rebuilt — the PM engine must use exact manufacturer intervals (never invented ones). *Blocks the PM engine's service-interval data.*
8. **Which greens mowers are back in service** since the Spartan parts arrived — sets the real readiness board baseline.
9. **Mowing heights/frequencies you actually run now** — the designed mow-rotation feature needs your validation before activation (spec requires qualified approval).

### Restaurant (Buckley's)
10. **Current menu with prices, and any recipes/portion standards that exist anywhere** (even a photo of the menu board). *Menu engineering is fully blocked without this.*
11. **Restaurant hours by season + which winter dayparts you're committed to.** *Winter contribution-margin model needs the fixed schedule.*
12. **Alcohol purchasing route** (which distributors are authorized) and license types held. *Gates any bar-cost module.*

### Pro shop
13. **Does RecTrac give per-item (SKU) sales at any granularity**, or only category totals? *Decides whether §11 retail analytics is buildable at all or stays category-level.*

### Simulators
14. **Candidate room(s): dimensions, ceiling height, electrical, and whether installation IT/cyber approval is needed for networked simulator PCs.** *§12 business case is blocked on these; everything else is research.*

### Financials
15. **FY26 approved budget by department** (even a photo of the budget sheet) — Financial Watch has budgets but revenue *targets* were never set; and the master spec's budget-vs-actual needs the approved figures, not just spend.
16. **Which monthly/annual reports you must submit up the chain** (names + due days) — each becomes an obligation with lead time.

### Staffing & procurement
17. **Authorized positions beyond maintenance** (golf ops, F&B) — the master plan covers maintenance (9 authorized); a position analysis needs the full authorization picture.
18. **Your micro-purchase threshold and approval chain for NAF purchases** — the §7 procurement gate should encode your real thresholds, not FAR generics.

### Customer experience
19. **Where do patrons actually review the course** (Google Maps? Facebook? Yelp?) and do you want review themes tracked in-app? *Sizes the §6 review-recovery feature; skip it if reviews live nowhere.*

---

## 6. Work classification & phased backlog

### Fable-required (architecture/cross-module/high-context)
| Pri | Item | Why Fable |
|---|---|---|
| Critical | **Phase 0: DB truth + safety** — drift-check script, bucket-by-bucket storage posture verification + signed-URL migration for sensitive buckets, restore-drill script, audit-log decision | Cross-cutting DB + storage + security; migration authoring |
| High | **Equipment PM engine** — manufacturer-interval model, meter-hour cadence added to obligations/recurrence architecture, readiness board, cost-per-hour rollup view | New cadence type touches the recurrence architecture; new rollup views |
| High | **Revenue targets in Financial Watch** — target model + pace flags (replaces `hasTarget=false` stub) | Core engine change, P&L integration |
| Med | **Procurement gate stages** — encode §7 checklist as PR lifecycle metadata with approval-route documentation | PR lifecycle is deep, multi-module |
| Med | **Mow-rotation engine** (after Q9 validation) — per the 2026-06-09 design | Scheduling/state logic |

### Suitable for the Sol/Terra/Luna environment (handoff packages)
- Cost-center validation on PR entry + orphan-bucket report (R5)
- `activity_log` insert wiring per the pattern Fable establishes, or SECURITY.md correction (R4)
- ESLint ignore for `public/vendor/`; Deno-override for edge-function `any` warnings
- README + `docs/database.md` staleness banners/refresh (R11)
- Sentry replay masking (R10); unscaled-PR indicator in Money (R9)
- 5–10 functional Playwright specs: create PR happy path, obligation complete/undo, inventory count, My Day rollover, revenue upload review screen (R8)
- `.single()` → `.maybeSingle()` + "Not found" states sweep (deferred M-4 from the April audit)
- Contractor pesticide-visit tracker page (dates, areas, REI, service report upload) — follows existing CRUD patterns
- Review-theme tracker (if Q19 says yes)

### Blocked on business information (do not start)
- Menu engineering (Q10–12) · SKU retail analytics (Q13) · Simulator business case (Q14) · Position/compensation analysis (Q17) · PM service intervals (Q7) · DPAS reconciliation (Q5)

### Requires management / external review (never automated)
- Anything pesticide-related beyond contractor tracking (license status, Q6)
- Section 889 conclusions (app flags; contracting/legal concludes)
- NAF wage/compensation decisions (HR route)
- Publishing review responses (draft-only in app)
- .mil system access of any kind (hard rule: never automated)

---

## 7. Recommended first implementation phase

**Phase 0 — "Truth & Safety" (small, high-leverage, zero feature risk):**
1. Read-only live-DB drift check (tables/views/policies vs migration folder), producing a checked-in report.
2. Storage posture verification; signed-URL migration for any sensitive bucket (staff docs) + rollback block.
3. Backup restore drill, documented in `docs/deployment.md`.
4. Audit-trail decision: implement lightweight `activity_log` writes at the ~10 highest-value mutation sites, or correct `SECURITY.md`. (Recommend implementing — cheap, and §11 of the objectives asks for an audit trail.)
5. Hygiene: ESLint vendor ignore, docs staleness banners.

Then **Phase 1 — Equipment PM engine** (the largest spec gap that is *unblocked* — pending only Q7/Q8 answers for interval data, and the engine architecture can be built with intervals configurable-not-invented).

---

## 8. First 30 days (compressed plan)

Assumes ~2–4 focused hours/day of app work alongside running the course. "Env" = which environment implements.

| Days | Objective | Work | Env | Verification |
|---|---|---|---|---|
| 1–2 | DB truth | Drift-check script + report; reconcile `poll_votes`/`005` question against live DB | Fable | Report checked in; zero unexplained diffs |
| 3–4 | Storage safety | Bucket audit; signed URLs for sensitive buckets | Fable | Staff-doc URL inaccessible without token |
| 5 | Backup drill | Restore to scratch project; document | Tyson+script | Restored row counts match |
| 6–8 | Audit trail | `logActivity()` helper + wire top mutation sites; tests | Fable→handoff | activity_log rows appear; tests pass |
| 9–10 | Hygiene | Lint ignore, docs banners, Sentry masking | Handoff | lint 0 errors; typecheck clean |
| 11–14 | E2E flows | 5 functional Playwright specs | Handoff | CI-able green run |
| 15–18 | PR integrity | cost_ctr validation + orphan report; unscaled-PR indicator | Handoff | Unit tests; bogus code rejected in UI |
| 19–25 | PM engine core | Meter/interval model, cadence extension, readiness board (intervals empty until Q7) | Fable | 687+ tests still green; new engine tests |
| 26–28 | PM engine UI | Service-due surfacing on /today + equipment detail | Handoff | Due tasks visible with fake meter data |
| 29–30 | Review + answers | Review handoff diffs; ingest Tyson's Q-answers; seed real intervals/obligations | Fable | Session-result doc |

**Days 31–90 (weekly milestones):** W5–6 revenue targets in Financial Watch → W7–8 contractor pesticide-visit tracker + procurement gate stages → W9 mow-rotation engine (post-validation) → W10–11 restaurant winter model *if* Q10–12 answered (else pro-shop category analytics from revenue sheets) → W12 simulator business-case research package (gated on Q14) timed for a pre-November decision → continuous: monthly restore drill, obligations for newly-learned deadlines.

---

## 9. One-year operating calendar — status

Largely **already implemented as data**, not documents: seeded obligations (`20260702_operating_rhythm.sql`) cover monthly anchors (AST inspections, extinguisher signatures, revenue rollups d.1–5, inventory counts last week) and annual anchors (889 renewals Oct, FY rollover Oct, spring/fall greens aeration May/Sep, overseed Sep, irrigation winterization ~Oct 25, simulator setup Nov, Reladyne one-time Aug). Weekly duties implement the in-season rhythm (mow/league/US Foods pattern), season-gated Mar 20–Oct 15.

**Gaps to add as obligations once confirmed** (all agronomic items need superintendent/agronomist validation per spec §E): asset-inventory submission dates (Q1), required up-chain reports (Q16), cert-specific renewals as they're entered, grub-treatment window (spring, *contractor-routed*), snow-mold prevention decision (Oct–Nov, contractor-routed), back-nine renovation milestone tasks (Aug–Sep 2026 — one-time project, belongs in capital projects + My Day), simulator go/no-go decision point (~Aug–Sep to hit November).

---

*Maintained deliverable. Update on each phase completion. Companion docs: `docs/OPERATION-BLUEPRINT.md` (business restructure), `audit-report.md` (2026-04-24 UI audit), `docs/GreenKeeper-Pro-Complete-Guide.md`.*
