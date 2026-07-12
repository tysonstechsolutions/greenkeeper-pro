# Live Database Drift Report — 2026-07-11

**Project:** Supabase `mbgublyqnyghmvqfooao` ("Superintendent") · **Repo baseline:** commit `4374069`
**Method:** Read-only introspection via the Supabase Management API (SELECT-only queries against `information_schema`, `pg_catalog`, `pg_policies`, `storage.buckets`, `cron.job`). No writes of any kind were made to the database, storage, or configuration.
**Comparison basis:** the 110 SQL files in `supabase/migrations/` plus application code expectations (`.from("…")` call sites in `src/` and `supabase/functions/`).

## 0. Headline

The live database is **healthy for daily operation** (all 109 public tables have RLS enabled, every table has policies, all three financial rollup views are correct, both cron jobs are active) — but the migration folder is confirmed to be **neither a superset nor a subset of the live schema**. Four migrations were never applied, ten live tables exist in no migration file, and there is **no applied-migration tracking of any kind** (`supabase_migrations.schema_migrations` exists and is empty). Five application features silently degrade today because they reference objects that don't exist.

## 1. Coverage — what was verified vs not

| Layer | Verification level |
|---|---|
| Tables (public schema) | ✅ Full set diff (109 live vs 109 expected — but sets differ, see §2) |
| Columns & types | 🟡 Targeted: `profiles`, `purchase_requests`, `poll_votes`, `obligations`, `schedules`, `pin_codes`, `vmgc_*`, `course_observations`, `equipment_inspections`. Full 1,415-column dump captured (`columns` snapshot) but not exhaustively diffed table-by-table against every migration — **marked unverified** at that granularity |
| Constraints | 🟡 434 constraints captured; spot-checked (poll_votes FKs, purchase_requests). Not exhaustively diffed — **partially verified** |
| Foreign keys | 🟡 Included in constraint dump; spot-checked. Known-by-design gap: `purchase_requests.items[].cost_ctr` is JSONB with no FK (matches repo) |
| Indexes | 🟡 417 captured; not exhaustively diffed (the `20260422_p2a/p2b` retro-fixes make file-order reconstruction noisy) — **partially verified** |
| Views | ✅ Full: exactly 3 live views, all expected (§5) |
| Functions | ✅ Full set diff (§6) |
| Triggers | 🟡 38 captured; spot-checked `update_updated_at` family — **partially verified** |
| RLS enablement | ✅ Full: **all 109 tables have RLS enabled**; zero disabled |
| RLS policies | ✅ Full: 398 policies dumped; anon-satisfiability analyzed policy-by-policy (§7) |
| Storage buckets/policies | ✅ Full (see companion `storage-posture-report-2026-07-11.md`) |
| pg_cron | ✅ 2 jobs: `daily_briefing` (0 11 * * *, active), `extend_task_series(365)` (0 7 * * *, active) |
| Extensions | ✅ pg_cron, pg_net, pg_stat_statements, **pg_trgm** (needed by `match_ai_library`), pgcrypto, plpgsql, supabase_vault, uuid-ossp |
| Migration tracking | ✅ `supabase_migrations.schema_migrations` exists and holds **0 rows** |

## 2. Tables — migrations vs live

### 2a. In migrations but ABSENT live (10 tables → 4 unapplied migrations)

| Missing table | Source migration | App impact |
|---|---|---|
| `community_posts`, `community_comments`, `community_likes`, `golfer_feedback`, `member_registrations`, `round_ratings`, `tee_times` | `005_missing_tables.sql` | `golfer_feedback` read by [dashboard/page.tsx:678] and `tee_times` by [morning-route/index.ts:546] — both fail silently (errors swallowed) |
| `asset_disposals` | `20260413_add_asset_disposals.sql` | [navcompt-2212-report.ts:52] reads it with error ignored → NAVCOMPT-2212 reports always render **without disposal data** |
| `irrigation_runs`, `irrigation_schedules` | `20260415_add_irrigation.sql` (partial — `irrigation_zones` exists) | No app references (superseded by `watering_plans`) — dormant |

### 2b. Live but in NO migration file (10 tables)

| Live-only table | Rows | App references? |
|---|---|---|
| `course_observations` | 1 | **YES** — `useObservations.ts`, monthly-board data/report |
| `equipment_inspections` | 0 | **YES** — `useEquipment.ts`, `/equipment/service-history-view` |
| `courses` | 1 | No (`useCourse.ts:22` comment claims table doesn't exist — stale; it does, app just doesn't query it) |
| `improvement_plan_items` | 25 | No |
| `improvement_plans`, `equipment_checkouts`, `shift_swap_posts`, `vmgc_conversations`, `vmgc_purchases` | 0 | No |
| `vmgc_issues` | 7 | No (legacy import staging, likely from `pull_course_data.py`) |

**Consequence:** a fresh rebuild from the migration folder would silently break the observations and equipment-inspection features, and would lose the 7 `vmgc_issues` rows + 25 `improvement_plan_items` rows unless exported first.

## 3. The specific investigations requested

### 3a. Duplicate `poll_votes` definitions — RESOLVED
Live columns are `id, poll_id, option_id, user_id, created_at` = exactly the **`20260419_add_polls.sql`** definition. The `005_missing_tables.sql` definition (`post_id`, `option TEXT`) is **not** what's live. Both files still contain bare `CREATE TABLE poll_votes` (no `IF NOT EXISTS`), so the folder remains un-replayable as-is.

### 3b. Was `005_missing_tables.sql` applied? — **NO (never applied)**
Evidence beyond the 7 missing tables: all four functions defined only in `005` (`increment_likes_count`, `decrement_likes_count`, `increment_comments_count`, `increment_poll_vote`) are absent live. The four `005` tables that DO exist live (`diagnostics`, `knowledge_articles`, `knowledge_read_log`, `poll_votes`) are explained otherwise: `poll_votes` came from `20260419_add_polls.sql`, and `diagnostics`/`knowledge_*` carry **live-only trigger functions** (`update_diagnostics_timestamp`, `update_observations_timestamp`) that appear in no migration — i.e., those tables were created ad-hoc in the SQL editor *before* `005` was written to document them, and `005` itself never ran (it would have errored on the pre-existing tables).

### 3c. Was `20260419_add_polls.sql` applied? — **YES (tables), minus nothing it defines**
`polls`, `poll_options`, `poll_votes`, `poll_comments` all live with the expected shape. (`increment_poll_vote` was a `005` function, not a polls-migration one.)

### 3d. Was `20260419_fix_fy26_assets_rls.sql` applied? — **YES**
Live `fy26_assets` policies are exactly the fix set (`fy26_assets_select_auth` / `insert_auth` / `update_auth` / `delete_mgr`), already in the `(select auth.uid())` init-plan form — so the `20260422_p2c` rewrite also touched them. Table grants present.

### 3e. Tables added after the 20260422 RLS hardening — **ALL COMPLIANT (kiosk-shaped)**
Every post-hardening table checked (obligations, duty/inventory/certification/calendar/staff/pro-shop/PR-audit/money families, 30 tables) has RLS enabled **and** policies present; the dominant live shape is `FOR ALL TO authenticated USING (true) WITH CHECK (true)` (24 such policies), matching the repo's deliberate kiosk pattern. Zero tables are in deny-all (RLS on, no policies) state.

### 3f. The three financial rollup views — **ALL PRESENT AND CORRECT**
`revenue_monthly_rollup`, `pr_spend_monthly_rollup`, `restaurant_spend_monthly_rollup` all exist with `reloptions = ['security_invoker=true']`, matching `20260702_money_rollups.sql` / `20260703_inventory_fnb.sql`.

## 4. Columns — targeted findings

- **`profiles.user_preferences` is MISSING** → `004_user_preferences.sql` was never applied. The app already degrades gracefully (`useUserPreferences.ts` special-cases error 42703 per the 2026-04-24 audit), so `/settings/notifications` prefs silently don't persist.
- `profiles.personnel_details` present ✓ (20260625 applied). `purchase_requests.actual_amount`, `.receipt_path`, `.quote_paths` present ✓ (20260617/20260702 applied). `obligations` full 16-column shape ✓.

## 5. Application references to nonexistent objects (production defects)

| # | App reference | Live reality | Symptom (all silent — errors swallowed) |
|---|---|---|---|
| D1 | `.from("schedule")` in `monthly-board-data.ts:90` and `monthly-board-report.ts:80` | table is **`schedules`** (has `schedule_date`, `user_id` — pure rename fix) | Monthly Board Report always shows **0 scheduled shifts / 0 crew** |
| D2 | `supabase.storage.from("attachments")` in `useKnowledge.ts:798,805` | **no `attachments` bucket exists** | Knowledge-article file attachment always fails (returns null, console.error) |
| D3 | `.from("asset_disposals")` in `navcompt-2212-report.ts:52` | table absent (migration unapplied) | NAVCOMPT-2212 renders without disposal record data |
| D4 | `.from("course_photos")`, `.from("task_checklist_items")`, `.from("task_notes")` in `offline-queue.ts:244,462,527` | none exist | Offline queue replay for photo-capture / checklist-toggle / note-add actions fails |
| D5 | `.from("golfer_feedback")` dashboard:678; `.from("tee_times")` morning-route:546 | absent (005 never applied) | Feedback panel empty; tee-time override never applies |

## 6. Functions

- 58 live (33 are pg_trgm extension internals — noise). All app-required functions present: `match_ai_library`, `is_manager`, `is_foreman`, `get_user_role`, `update_updated_at_column`, `handle_new_user`, `extend_task_series` (driven by cron job 2).
- Missing vs migrations: only the four `005` community/poll counters (unreferenced by app).
- Live-only: `update_diagnostics_timestamp`, `update_observations_timestamp`, `update_shift_swap_timestamp` — ad-hoc era artifacts backing live-only/pre-005 tables.

## 7. RLS / grants — the anon surface (detail in storage/handoff docs)

RLS is enabled everywhere, but the **anon role** holds table grants on 112 public tables (INSERT on 38), and 33 tables have policies whose roles include `anon`/`public`. Most such policies contain `auth.uid()`/`is_manager()` quals that evaluate false for anon (NULL propagation) — those deny in practice. Policy-by-policy satisfiability analysis leaves this **effective unauthenticated access** (grant ∧ policy both pass):

| Table | Anon can… | Live policy | Rows at stake | In repo? |
|---|---|---|---|---|
| `pin_codes` | SELECT where `is_active` — **plaintext `pin` column** | `Anon can verify pins` | **18 active PINs** | Yes — `20260419_add_pin_codes.sql:64` (legacy client-side PIN-check design) |
| `profiles` | SELECT where `is_active` — names, phones, roles, `personnel_details` JSONB | `profiles_select_active` | **17 active profiles** | Yes — `001_initial_schema.sql:580` |
| `vmgc_issues` / `vmgc_purchases` / `vmgc_conversations` | **full SELECT/INSERT/UPDATE/DELETE** (qual `true`) | ad-hoc | 7 / 0 / 0 rows | **No — live-only** |
| `task_series` | SELECT (qual `true`) | `task_series_select` | low sensitivity | Yes |
| `invites` | UPDATE where `used_by IS NULL` | `invites_update_use` | 1 unused invite | Yes |

`activity_log`: **0 rows** — confirms the audit-trail table has never been written to (matches the code finding: no insert sites).

## 8. Migration-history integrity conclusions

1. There is **no record of what was applied** (`schema_migrations` empty; per-file "APPLIED …" comments exist for only one file).
2. Four migrations are confirmed unapplied: `004`, `005`, `20260413_add_asset_disposals`, and the runs/schedules portion of `20260415_add_irrigation`.
3. Ten live tables and three live trigger functions have no migration file (ad-hoc era, pre-~April).
4. Everything from `20260407` onward **except** `20260413` and part of `20260415_add_irrigation` is verified applied at the objects-exist level.
5. The folder cannot be replayed on a fresh database as-is (bare `CREATE TABLE` collisions in `001/002/003/005/20260419_add_polls`; `p0a` hardening sweep is date-positioned before ~50 later tables).

## 9. Unverified items (explicitly not guessed)

- Column/constraint/index parity for the ~100 non-targeted tables (dumps captured in session scratchpad; diffing deferred to Phase 0B tooling).
- `auth.users` contents (deliberately not queried).
- Storage object contents/filenames beyond top-level folder aggregates (deliberately not listed).
- Edge-function secret values (not queried; names only, from repo scripts).
- Whether Supabase's own daily backups are running/restorable (provider console, not visible via this API path) — **restore drill remains untested**.

---
*Read-only Phase 0A deliverable. Companion: `storage-posture-report-2026-07-11.md`, `../handoffs/phase-0b-remediation-handoff.md`. No database, storage, code, or data changes were made.*
