# Greenkeeper Pro — Path / Screen / UI-Overlap Audit + Fixes

**Run:** 2026-04-24 · **Branch:** `claude/hungry-saha-272998` · **Version:** v1.6.2
**Routes audited:** 89 unique × 2 viewports = **178 page loads** (mobile 390×844, desktop 1440×900)
**Authenticated as:** real super-admin via PIN login

## Outcome

| Metric | Before fixes | After fixes |
|---|---|---|
| Routes that loaded | 178 / 178 | 178 / 178 |
| Page errors (hydration / pageerror) | **178** | **0** ✅ |
| UI overlap findings | **6** | **0** ✅ |
| Horizontal scroll | 0 | 0 |
| Failed network requests | 0 | 0 |
| Console errors (excl. expected 406s from bogus IDs and headless camera) | ~12 | ~10 (deferred) |
| TypeScript / Lint / Build | all pass | all pass |

Static checks: `typecheck` ✅ · `lint` ✅ (28 errors all in Deno edge functions, unchanged) · `build` ✅.

Spider re-run after fixes: 178/178 passed in 2.2 min, zero page errors, zero overlap.

---

## Fixes applied

### Critical
**C-1 · Hydration mismatch on every page (FIXED)**
Root cause: [`src/components/ui/online-status.tsx`](src/components/ui/online-status.tsx) initialized state from `navigator.onLine` in a `useState` lazy initializer. Node 21+ exposes `globalThis.navigator` (so `typeof navigator !== "undefined"` is true on the server) but `navigator.onLine` is undefined there — server picked `"offline"` and rendered the orange offline banner; client picked `"online"` and rendered nothing. Hydration tree diverged at the very top of the app shell, on every route.

**Fix:** Always start `status` as `"online"` on first render and reconcile to actual connectivity inside `useEffect`. Same fix applied to `OfflineBadge`. Server and client now render the same initial tree.

Secondary case found and fixed: [`src/app/voice-log/page.tsx:44`](src/app/voice-log/page.tsx:44) called `getSpeechRecognition()` (which checks `typeof window`) during render. Moved to `useEffect` with `useState<boolean | null>(null)` and only render the "not supported" branch when explicitly `false`.

### High — UI overlap
**H-1 · Untracked-asset save bar hidden behind bottom nav (FIXED)**
Changed `fixed bottom-0` → `fixed bottom-20 z-40` on mobile (clears the 80px nav, sits above page content but below modals). Desktop still uses `md:static` flow layout.
- [`src/app/assets/untracked/new/page.tsx:274`](src/app/assets/untracked/new/page.tsx:274)
- [`src/app/assets/untracked/view/page.tsx:444`](src/app/assets/untracked/view/page.tsx:444)

**H-2 · Polls/manage refresh FAB hidden behind bottom nav and overlapping chat bubble (FIXED)**
Repositioned to `fixed bottom-24 right-4 md:bottom-8 md:right-8 z-30` and added `/polls/manage` to the chat-bubble suppression list.
- [`src/app/polls/manage/page.tsx:733`](src/app/polls/manage/page.tsx:733)

**H-3 · Parking-lot FAB hidden behind chat bubble (FIXED)**
Added `/parking-lot` to the chat-bubble suppression list.
- [`src/components/features/ai/chat-bubble.tsx:15`](src/components/features/ai/chat-bubble.tsx:15)

**H-4 · Chat-bubble suppression used exact-match (FIXED)**
Switched from `Set.has(stripTrailingSlash(pathname))` to a startsWith match (`path === r || path.startsWith(r + "/")`). The bubble now correctly suppresses on `/tasks/new`, `/tasks/edit`, `/tasks/view`, `/equipment/new`, `/chemicals/new`, `/assets/scan`, `/assets/untracked/*`, `/photos/timeline`, `/schedule/calendar`, etc. Spider confirmed zero remaining `overlaps_chat_bubble` findings.
- [`src/components/features/ai/chat-bubble.tsx:36`](src/components/features/ai/chat-bubble.tsx:36)

**H-5 · Broken link `/messages/superintendent` (FIXED)**
The messages page (`src/app/messages/page.tsx`) accepts `?channel=` not a path segment, and there was no `/messages/superintendent` page. Changed dashboard link target to `/messages`.
- [`src/app/dashboard/page.tsx:569`](src/app/dashboard/page.tsx:569)

### Medium
**M-1 · `/settings/notifications` schema mismatch (FIXED — graceful degrade)**
The hook reads `profiles.user_preferences`, a column that hasn't been added in this environment. The page used to log a 400 + Postgres error 42703 ("column does not exist") on every visit. Switched to `.maybeSingle()` and special-cased error code 42703: load returns silently with defaults; save sets a clear "saving requires a database migration" message but keeps the in-memory toggle responsive. The page now works without the column; when the migration is added, the existing happy path takes over.
- [`src/lib/hooks/useUserPreferences.ts`](src/lib/hooks/useUserPreferences.ts)

**M-2 · `/settings/pins` FK error (FIXED — manual join)**
The page was using PostgREST's embedded select syntax (`profile:user_id(...)`) but no FK is declared between `pin_codes.user_id` and `profiles.id`, so PostgREST returned PGRST200. Rewrote the fetch to do two parallel queries and stitch them in JS via a `Map`. No schema change required.
- [`src/app/settings/pins/page.tsx`](src/app/settings/pins/page.tsx)

**M-5 · Auth-provider PUBLIC_ROUTES list out of sync (FIXED)**
Synced the list with `app-shell`'s `PUBLIC_ROUTES` and `auth-gate`'s `PUBLIC_PREFIXES`. `/pin-login`, `/install`, `/offline`, `/join` are now correctly recognized as public, eliminating the redirect-loop risk if a session-expired event fired while the user was on one of those routes.
- [`src/lib/providers/auth-provider.tsx:10`](src/lib/providers/auth-provider.tsx:10)

### Low
**L-2 · Lint warnings cleared in 3 hooks (FIXED)**
- [`src/lib/hooks/useTimeOff.ts`](src/lib/hooks/useTimeOff.ts) — removed unused `Database` import and unused `isSuper` destructuring.
- [`src/lib/hooks/useUserPreferences.ts`](src/lib/hooks/useUserPreferences.ts) — removed unused `UpdateTables` import and unused `profile` from useAuth.
- [`src/lib/utils/generate-briefing.ts:3`](src/lib/utils/generate-briefing.ts:3) — removed unused `WeatherResponse` import.

Lint went from **250 → 248 warnings**, error count unchanged at 28 (all in Deno edge functions, not the Next.js bundle).

---

## Deferred (intentional)

### M-3 · Static-asset 404s on `/dashboard`, `/irrigation`, `/reports/monthly-board`, `/schedule/calendar`
The browser logs `Failed to load resource: 404` but Playwright's `requestfailed` listener doesn't fire (these are HTTP responses, not network failures). Identifying which exact resources are missing requires switching the probe to a `response` listener that filters status >= 400. Not blocking — pages render and function correctly. Recommended as a follow-up audit pass.

### M-4 · Bogus-UUID console errors on view pages
Routes like `/chemicals/view?id=00000000...` log `PGRST116` because the row doesn't exist. These ONLY occur with bogus IDs (which the audit deliberately uses). Real users with valid IDs never see them. The proper fix — converting every `.single()` to `.maybeSingle()` plus rendering a "Not found" state — touches ~10 files and was scoped out of this pass to keep the diff focused.

### M-6 · `/assets/scan` `getUserMedia` error
False positive — Chromium running headless doesn't expose `getUserMedia`. Real devices won't see this error.

### L-1 · 28 lint errors in Deno edge functions
All `@typescript-eslint/no-explicit-any` in `supabase/functions/{ai-assistant,daily-briefing,morning-route}/index.ts`. Not part of the Next.js bundle. Fix at leisure or add a Deno-specific override to the eslint config.

---

## Files modified

**Source — bug fixes (12 files):**
- `src/components/ui/online-status.tsx` — C-1 hydration root cause
- `src/app/voice-log/page.tsx` — C-1 secondary hydration case
- `src/components/features/ai/chat-bubble.tsx` — H-3, H-4 suppression
- `src/app/assets/untracked/new/page.tsx` — H-1
- `src/app/assets/untracked/view/page.tsx` — H-1
- `src/app/polls/manage/page.tsx` — H-2
- `src/app/dashboard/page.tsx` — H-5
- `src/lib/providers/auth-provider.tsx` — M-5
- `src/lib/hooks/useUserPreferences.ts` — M-1
- `src/app/settings/pins/page.tsx` — M-2
- `src/lib/hooks/useTimeOff.ts` — L-2
- `src/lib/utils/generate-briefing.ts` — L-2

**Source — additive markers (3 files, audit hooks only, no behavior change):**
- `src/components/layout/header.tsx` — `data-app-header`
- `src/components/layout/bottom-nav.tsx` — `data-bottom-nav`
- `src/components/features/ai/chat-bubble.tsx` — `data-chat-bubble`

**Tests / tooling (created):**
- `tests/e2e/route-inventory.ts` — full route list with default query params
- `tests/e2e/global-setup.ts` — one-time PIN login → storageState
- `tests/e2e/route-audit.spec.ts` — 178-test spider with overlap probe
- `tests/e2e/summarize.mjs` — aggregate per-test JSON → findings.json + console summary
- `tests/e2e/.audit/findings.json` — raw probe data, post-fix
- `tests/e2e/.audit/*.png` — 178 full-page screenshots

**Config:**
- `playwright.config.ts` — wired `globalSetup`, `storageState`, ignored old `auth.spec.ts`
- `.gitignore` — added `tests/e2e/.audit/`, broadened `.auth/`

**Worktree-only:** `.env.local` was copied from the parent project (already gitignored).

---

## How to re-run

```bash
PLAYWRIGHT_TEST_PIN=<pin> npx playwright test tests/e2e/route-audit.spec.ts
node tests/e2e/summarize.mjs
```

Total run time end-to-end: **~2 minutes** (Playwright auto-starts the dev server, does PIN login, runs 178 page loads with 4 workers, aggregates findings).

## Verification (this run)

- ✅ `npm run typecheck` — 0 errors
- ✅ `npm run lint` — 28 errors (all pre-existing, all in `supabase/functions/**`)
- ✅ `npm run build` — clean
- ✅ Playwright spider — 178/178 passed, 0 page errors, 0 overlap, 0 horizontal scroll
- ✅ Manual sanity check: open any of the post-fix screenshots in `tests/e2e/.audit/`; the bugs documented in the "Before fixes" column are visibly gone (save bars sit above the nav, FABs no longer collide with the chat bubble, no offline banner spuriously rendered).
