# Phase 0B Remediation Handoff — prepared 2026-07-11 (Phase 0A output)

**Status: NOT authorized to implement. Awaiting Tyson's review of the Phase 0A reports.**
Sources of truth: `docs/security/live-db-drift-report-2026-07-11.md`, `docs/security/storage-posture-report-2026-07-11.md`, repo commit `4374069`.

Environment key: **Fable** = architecture/migration/cross-module work · **Sol/Terra/Luna** = pattern-following code fixes with precise acceptance criteria · **Tyson** = management decision or manual console action.

---

## A. Findings by category

### A1. Confirmed production defects (app behavior wrong today)
- **D1** Monthly Board queries table `schedule`; live table is `schedules` → report always shows 0 shifts/crew.
- **D2** Knowledge-article attachments upload to nonexistent `attachments` bucket → feature silently fails.
- **D3** NAVCOMPT-2212 report reads missing `asset_disposals` table → disposal data always blank.
- **D4** Offline queue replays against nonexistent `course_photos` / `task_checklist_items` / `task_notes` → those queued actions fail on sync.
- **D5** Dashboard `golfer_feedback` and morning-route `tee_times` reads hit absent 005 tables → silent no-ops (features retired/optional — see A7).

### A2. Security exposures
- **S1** `staff-documents` bucket PUBLIC + `staff_docs_select to public` + `use-employee.ts` stores unsigned public URLs. **Latent (0 objects)** — fix before first HR upload.
- **S2** `pin_codes`: plaintext `pin` column, anon SELECT policy → **18 active PINs readable unauthenticated** with the anon key (which ships in every client bundle).
- **S3** `profiles_select_active` anon SELECT → **17 active staff profiles** (names, phones, roles, `personnel_details` JSONB) readable unauthenticated.
- **S4** `vmgc_issues`/`vmgc_purchases`/`vmgc_conversations`: **anon full CRUD** (qual `true`) — also a data-loss vector (anon DELETE). 7 rows of legacy issue data at stake.
- **S5** `documents` bucket PUBLIC (generated SOW/sole-source/onboarding PDFs; 1 object). Read path (`createdDocUrl`) depends on public URLs.
- **S6** Defense-in-depth: anon holds table grants on 112 tables (INSERT on 38); only the S2–S4 + `task_series` SELECT + `invites` UPDATE(`used_by IS NULL`) intersections are effective today, but the broad grants mean any future permissive policy instantly becomes an anon hole.

### A3. Migration-history inconsistencies
- **M1** `005_missing_tables.sql` never applied (7 tables + 4 functions absent; its 4 "existing" tables were ad-hoc creations that predate it).
- **M2** `004_user_preferences.sql` never applied (`profiles.user_preferences` missing; app has a 42703 workaround).
- **M3** `20260413_add_asset_disposals.sql` never applied (→ D3).
- **M4** `20260415_add_irrigation.sql` partially applied (`irrigation_runs`/`irrigation_schedules` absent; unreferenced — superseded by `watering_plans`).
- **M5** 10 live-only tables with no migration file; **2 are app-load-bearing** (`course_observations`, `equipment_inspections`) → fresh rebuild breaks those features. 3 live-only trigger functions likewise uncaptured.
- **M6** `supabase_migrations.schema_migrations` empty — no applied-tracking mechanism at all.
- **M7** Folder not fresh-replayable (bare `CREATE TABLE` collisions in 001/002/003/005/20260419_add_polls; `p0a` sweep date-ordered before ~50 later tables).

### A4. Documentation-only discrepancies
- `SECURITY.md` claims an audit trail; `activity_log` has **0 rows** and zero write sites.
- `docs/database.md` frozen at migration 004; `README.md` describes the removed 8-role model and lists 4 migrations (there are 110).
- `useCourse.ts:22` comment says no `courses` table exists — it does (1 row), app just doesn't use it.
- `SECURITY.md` implies signed/expiring file access; `createSignedUrl` is used nowhere.

### A5. Accepted kiosk-model behavior (no change without Tyson's direction)
- Single shared account; `NEXT_PUBLIC_APP_EMAIL/PASSWORD/PIN` in the client bundle; RoleGuard pass-through.
- `FOR ALL TO authenticated USING (true)` policy shape on post-hardening tables.
- `photos` bucket public (CDN course photos).
- CORS `*` on edge functions (JWT-enforced).

### A6. Requires management decision (Tyson)
- **MD1** Privatize `documents` bucket? (Requires reworking `/documents` re-download links to `.download()`/signed URLs — small code change, included as option in package below.)
- **MD2** Disposition of legacy data: `vmgc_*` (7 rows), `improvement_plan_items` (25 rows), `courses` (1 row), 18 `pin_codes` rows (17 belong to the retired per-person PIN era), 1 unused invite. Archive-then-drop vs keep-and-lock-down. **Nothing is deleted in Phase 0B without explicit approval.**
- **MD3** Apply `20260413_add_asset_disposals.sql` to restore the NAVCOMPT-2212 disposal feature (it's an *unapplied* migration, not a rerun)?
- **MD4** Backup restore drill scheduling (needs Supabase console access / paid-plan confirmation).

### A7. No action needed
- All 109 tables RLS-enabled, zero deny-all tables; three rollup views correct (`security_invoker=true`); `20260419_fix_fy26_assets_rls` and `20260419_add_polls` verified applied; post-20260422 tables all policied; pg_cron jobs active; `pg_trgm` present; D5's `golfer_feedback`/`tee_times` reads live in retired/optional surfaces and degrade harmlessly — fold into future cleanup, not 0B.

---

## B. Correction specifications

### B1. Anon lockdown migration — fixes S2, S3, S4, S6 (partial), invites/task_series
| Field | Value |
|---|---|
| Exact live condition | Anon-satisfiable policies: `pin_codes."Anon can verify pins"` (SELECT, `is_active`), `profiles.profiles_select_active` (SELECT, `is_active`), `vmgc_issues/vmgc_purchases/vmgc_conversations` FOR ALL `true`, `task_series_select` (`true`), `invites_update_use` (`used_by IS NULL`); anon table grants incl. INSERT on 38 tables |
| Expected condition | No anon-role read/write on any public table; anon grants revoked (anon needs nothing — PIN login runs in the `pin-login` edge function with the service-role client) |
| Evidence | Drift report §7; `analyze5` policy-satisfiability pass; row counts (18 PINs / 17 profiles) |
| Affected app files | None expected — `pin-login/index.ts` uses `getAdminClient()`; client always runs authenticated. **Must verify** `/settings/pins`, `/pin-login` redirect stub, `pin-signup` edge fn before merge |
| Affected DB objects | 5 policies dropped/re-scoped to `authenticated`; `REVOKE ALL ... FROM anon` on public tables (keep `USAGE` on schema + SELECT nothing) |
| Severity | High |
| Data-loss risk | None (policy/grant change only) |
| Rollback | Commented block re-creating each dropped policy + re-granting, per `20260422_*` convention |
| Owner | **Fable** (authors migration; Tyson applies via Management API) |
| Tests | Scripted anon-key probe (read-only harness): pre = rows returned; post = 401/0 rows for pin_codes/profiles/vmgc_*; authenticated paths still pass; PIN login e2e (`scripts/test-pin-login.ps1`) |
| Acceptance | Anon probe returns zero data on all five surfaces; app smoke (today/staff/settings-pins) unaffected; pin-login works |

### B2. Privatize `staff-documents` + switch read path — fixes S1
| Field | Value |
|---|---|
| Exact live condition | Bucket `public: true`; `staff_docs_select` SELECT `to public`; `use-employee.ts:146` stores `publicStorageUrl(...)` |
| Expected condition | Bucket private; SELECT policy `to authenticated`; app reads via `storage.download()` (vendor-files pattern, `pr-audit/download.ts:124`) or short-lived signed URLs; stored value becomes the storage *path*, not a URL |
| Evidence | Storage report §2; `20260617140000_staff_system.sql:76,88` |
| Affected app files | `src/lib/staff/use-employee.ts` (upload/read/delete), `src/app/staff/profile/page.tsx` (render), possibly `extract-staff-doc` edge fn input (verify it receives base64, not URL) |
| Affected DB objects | `storage.buckets.staff-documents.public → false`; policy `staff_docs_select` re-scoped |
| Severity | High (latent) — **cheapest now, while 0 objects exist** |
| Data-loss risk | None (bucket empty; no stored URLs to migrate — verified `staff_documents` table via drift snapshot) |
| Rollback | Flip `public` back + restore policy (commented block); revert code commit |
| Owner | **Fable** (bucket/policy migration + read-path pattern); **Sol/Terra/Luna** may do the component wiring from Fable's pattern |
| Tests | Unit: url-helper returns path not URL; manual: upload → renders authenticated, direct unauthenticated URL fetch fails; existing staff-profile tests pass |
| Acceptance | Unauthenticated GET of an uploaded object's public URL returns 400/404; profile page still shows the doc; 687-test suite green |

### B3. Fix D1 — `schedule` → `schedules`
| Field | Value |
|---|---|
| Exact live condition | `monthly-board-data.ts:90`, `monthly-board-report.ts:80` query `.from("schedule")` → PGRST 42P01, caught, returns zeros |
| Expected condition | Query `schedules` (columns verified live: `schedule_date`, `user_id`) |
| Evidence | Drift report §5 D1 |
| Affected files | Those two + any shared type; DB: none |
| Severity | Medium (wrong numbers on a leadership report) · Data-loss risk: none · Rollback: revert commit |
| Owner | **Sol/Terra/Luna** |
| Tests | Unit test with mocked client asserting table name + non-zero aggregation; typecheck |
| Acceptance | Monthly board shows real shift counts for a seeded week |

### B4. Fix D2 — knowledge attachments bucket
| Field | Value |
|---|---|
| Exact live condition | `useKnowledge.ts:798,805` targets nonexistent `attachments` bucket → upload always errors (caught → null) |
| Expected condition | Attachments land in an existing bucket. Recommended: `documents` bucket under `knowledge/<courseId>/…` so they inherit MD1's privacy outcome; read via same mechanism as created-docs |
| Evidence | Storage report §4 row 10 |
| Affected files | `src/lib/hooks/useKnowledge.ts`; DB/storage: none (no new bucket) |
| Severity | Medium (silent feature failure) · Data-loss risk: none · Rollback: revert commit |
| Owner | **Sol/Terra/Luna** (after MD1 decision so the read pattern is known) |
| Tests | Unit: upload path + returned reference shape; manual attach/render cycle |
| Acceptance | Attaching a file to a knowledge article succeeds and renders after reload |

### B5. `activity_log` write path — fixes A4 claim vs A7 reality (approved direction from Phase 0 plan)
| Field | Value |
|---|---|
| Exact live condition | Table exists, RLS'd, **0 rows**; no insert site in app or edge functions; SECURITY.md claims logging |
| Expected condition | `logActivity(action, entity, entity_id, details)` helper (best-effort, never throws) wired at top ~10 mutation sites (PR create/status, obligation complete, inventory count save, staff doc upload, revenue entry, fuel refill, cert add, duty toggle) |
| Evidence | Drift report §7 (0 rows); tests/security agent finding |
| Affected files | New `src/lib/audit/log.ts`; one-line calls in the mutation hooks; DB: none (table exists) |
| Severity | Medium (compliance/documentation integrity) · Data-loss risk: none · Rollback: remove calls |
| Owner | **Fable** defines helper + pattern; **Sol/Terra/Luna** wires remaining sites |
| Tests | Unit: helper swallows failures; integration: action → row appears |
| Acceptance | Each listed action produces one `activity_log` row; UI latency unaffected; SECURITY.md updated to describe actual coverage (incl. shared-account attribution limit) |

### B6. Migration-history capture (M5/M6) — schema-truth tooling, no DB changes
| Field | Value |
|---|---|
| Exact live condition | 10 live-only tables + 3 live-only functions uncaptured; no applied-tracking |
| Expected condition | (a) `supabase/migrations/20260711_capture_live_only_objects.sql` — idempotent `CREATE TABLE IF NOT EXISTS` documentation-capture for `course_observations`, `equipment_inspections` (+ others per MD2 outcome), marked "captures pre-existing live objects; applying is a no-op on prod"; (b) a checked-in `scripts/db-drift-check.ps1` re-running the Phase 0A introspection and diffing, for one-command future audits; (c) start recording applied files in `supabase_migrations.schema_migrations` going forward |
| Evidence | Drift report §2b, §8 |
| Severity | Medium (rebuild/DR integrity) · Data-loss risk: none (no-op on live) · Rollback: n/a (documentation capture) |
| Owner | **Fable** |
| Tests | Script runs green against live; capture file lints; fresh-DB replay NOT attempted (out of scope) |
| Acceptance | Drift check reports zero unexplained diffs after capture files land |

### B7. Documentation corrections (A4)
Owner: **Sol/Terra/Luna**. Stale banners on `docs/database.md` + `README.md` pointing at the drift report and current reality; `SECURITY.md` audit-trail + signed-URL claims corrected to match B5/B2 outcomes; fix `useCourse.ts:22` comment. Severity: Low. Tests: none (docs). Acceptance: no doc claims a control that doesn't exist.

### Deferred (explicitly NOT in 0B)
- MD1 documents-bucket privatization (do with B4 once decided), MD2 legacy-data disposition, MD3 asset_disposals application (+ D3 retest), D4 offline-queue legacy actions (fix or remove queue handlers — needs a design pass), D5 retired-surface reads, photo-policy consolidation, observation-bucket cleanup, `drone-flights` URL builder, Sentry replay masking, `.single()→.maybeSingle()` sweep.

---

## C. Smallest safe Phase 0B package (recommendation)

Three commits, ~1 session, no data deleted, nothing user-visible changes except two bug fixes:

1. **B1 — anon lockdown migration** (Fable-authored SQL, Tyson applies; rollback block included). Closes the only *unauthenticated* data exposure (18 PINs, 17 profiles, anon-deletable legacy tables) with zero app-code risk.
2. **B2 — privatize `staff-documents`** (bucket flip + policy + `use-employee.ts` read path). Do it while the bucket is empty — after the first HR upload this becomes a data-migration task instead of a config change.
3. **B3 — the `schedules` rename** (two-line fix + test). Trivial, makes a leadership-facing report truthful.

Everything else (B4–B7, MD1–MD4) queues behind your review. B1+B2 require your Management-API/console application step; nothing in this package deletes a single row or object.

**Verification bundle for the package:** anon-key probe script (before/after), `scripts/test-pin-login.ps1`, full `npm run test:run` + typecheck, manual staff-doc upload/view cycle, monthly-board spot check.

---
*Prepared by Fable from Phase 0A read-only findings. No corrective work has been performed.*
