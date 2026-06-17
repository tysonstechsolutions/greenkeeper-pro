# GM ⇄ Superintendent dual-view — design (2026-06-17)

## Goal
One app, two manually-switchable views — **Superintendent** (turf/ops, = today's app) and **General Manager** (business/admin). Remove the PIN login and per-person roles. All data is shared.

## Decisions (from brainstorm with owner)
- **Access:** fully open, no gate. The app auto-connects to Supabase in the background.
- **No roles, no per-person passwords.**
- **Manual switch:** first-launch picker + header toggle + Settings entry; remembered per device.
- **Shared data:** ONE database. Both views read/write the same assets, work orders, purchase requests, 889s, etc. Views differ only in home screen + nav emphasis. Nothing is siloed.

## Auth model
- A single shared Supabase account (role = `super`) is auto-signed-in on boot. Credentials live in `NEXT_PUBLIC_` env (public — acceptable in a fully-open model). The user never sees a login.
- RLS untouched: the shared account is a full-access (super) user, so all existing policies + role checks pass. "No roles" is realized by everyone being this one full-access identity; UI differentiation comes from the view switch, not role.
- `/pin-login` is removed from the boot flow (AuthGate auto-signs-in instead of redirecting). The pin-login page/edge function can be retired afterward.

## View system
- `ViewProvider` (React context) holds current view (`'super' | 'gm'`), persisted in `localStorage` (`gk_view`).
- First launch (no stored view) → full-screen picker.
- Header: compact Super/GM segmented toggle. Settings: same toggle.
- Nav (bottom-nav + sidebar) is driven by `view`, not role.

## The two views
**Superintendent** (unchanged): Dashboard, Tasks, Course Map, Assets, + turf under More (irrigation, chemicals, equipment, inspections, weather, knowledge, crew schedule…).

**General Manager:**
- Home = GM dashboard: budget used, open PRs (approve), budget-vs-spend, revenue, upcoming tournaments, board-report shortcut.
- Nav: Dashboard, Budget, Purchase Requests, Reports, + More (vendors, revenue, tournaments, clubhouse, capital projects, sole-source, SOW, polls, staff, messages…).

## Implementation phases
1. **Auto-connect:** shared account + boot auto-sign-in; bypass PIN. Verify real data loads with no login.
2. **ViewProvider** + persistence + first-run picker.
3. **Header toggle + Settings** entry.
4. **View-driven nav** (bottom-nav, sidebar).
5. **GM dashboard** page/home.
6. Cosmetic role removal (hide role labels); build + full verify.

## Risks / notes
- Auth change could block data access if misconfigured → verify in preview with the real shared account (loads real data).
- Public exposure is the chosen tradeoff: anyone with the URL gets full access.
- Do NOT delete existing users/profiles — not required; keep the data.
- Crew capacity is tiny (3 people) — keep both dashboards lean and realistic.

## Status — IMPLEMENTED 2026-06-17
All phases done and verified (typecheck + lint + production build all pass; build prerenders 116 routes incl. /gm; `curl /settings/` → 200 no redirect; GM dashboard screenshotted with live data).

Shipped:
- Shared account `kiosk@vmgc.app` (role super) created in Supabase; auto-sign-in in `useAuth` via `NEXT_PUBLIC_APP_EMAIL`/`NEXT_PUBLIC_APP_PASSWORD`.
- `AuthGate` no longer gates (bounces only defunct /login,/pin-login → /dashboard); `AuthProvider` silently re-auths on session loss.
- `ViewProvider` + `nav-config` (view-driven bottom-nav + sidebar) + header `ViewSwitch` + first-run `ViewPicker` + Settings "App view" toggle + view-aware root redirect.
- New `/gm` GM dashboard (live PR counts + GM toolbox). Sign Out + PIN-management removed from the UI.

**To deploy:** add `NEXT_PUBLIC_APP_EMAIL` + `NEXT_PUBLIC_APP_PASSWORD` to the production env (Vercel) and rebuild the Android APK. The `kiosk@vmgc.app` account already exists.

**Not done (optional follow-ups):** retire the pin-login page + `pin-login` edge function; de-role the codebase fully (currently roles still exist but are mooted by the super shared account).
