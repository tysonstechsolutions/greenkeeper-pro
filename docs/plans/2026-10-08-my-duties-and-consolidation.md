# My Duties + app consolidation — plan (2026-10-08)

Goal from Tyson: consolidate, upgrade, beautify, and make the app make sense,
so daily, weekly, monthly, quarterly, and yearly duties are easier to get done.

## Done (commit dab40f2)

- **My Duties** (`/my-duties`) is the new home. It has five tabs: Today, Week, Month, Quarter, Year.
  - Each tab shows the recurring checklist for that period with a progress bar,
    **Catch up first** (missed earlier, oldest first), **Also due** (bigger
    cycles landing in the window), and other dated work (tasks, PRs, goals).
  - Today also shows **Start these soon** (inside the heads-up window).
    Year also shows a 12-month look-ahead.
  - One tap checks a duty off for the right period. Undo asks for a reason
    (logged).
  - Crew duty occurrences are left out on purpose: they're on the printed crew sheets
    (Operations → Print).
- **Add / edit / stop tracking / resume** recurring duties in the app. Before
  this, adding one needed a SQL migration. New or rescheduled duties start
  counting today, so past dates never show as late.
- Navigation: home, bottom nav, and sidebar open My Duties first. Operations
  sits next to it. Calendar left the bottom nav (it's in the Course & Range and
  Restaurant hubs, and in search). `/today` and `/my-day` redirect to My Duties.
- Dead link fixed: the crew schedule duty pointed at the removed `/schedule`.
  The app now redirects it. Migration `20261015120000_obligation_schedule_link.sql`
  fixes the stored row (optional; safe to run anytime).

Code: `src/lib/rhythm/` (pure logic, tested), `src/components/features/rhythm/`,
`src/app/my-duties/page.tsx`.

## Next candidates (need Tyson's call before merging pages)

Each one merges pages that overlap today. Nothing gets deleted until Tyson says so.

1. **Duties live in 4 places.** My Duties (yours), Duty Ownership
   (`/operations/duties`, who does crew duties), Duty & Cleaning Log
   (`/duty-log`, completion history), and "Shop Duties" (just a redirect to Duty
   Ownership, but still a separate menu card). Proposal: make the log a
   *History* tab on Duty Ownership, and drop the Shop Duties card.
2. **Two standards pages.** `/standards` is the live scorecard. `/standards-plan`
   is the static FY24 assessment. Proposal: show FY24 as a read-only *Baseline* tab
   inside Program Standards, with one menu entry.
3. **GM Dashboard duplicates the Money hub.** `/gm` is a link grid of the same
   money tools. Proposal: fold it into the Money hub.
4. **Equipment vs Assets vs Fleet Readiness.** `/equipment` is titled
   "Assets" in the header, and readiness is a third card. Proposal: one *Assets* page with a
   *Readiness* tab.
5. **Purchasing.** Procurement hub, Purchase Requests, PR Audit, Order List,
   Create PR. Proposal: PR Audit becomes a tab on Purchase Requests.
6. **Operations Command Center is dense.** It has 14 sections and 12 filters. Proposal: open
   on 4 sections (Overdue, Today, This week, Waiting), with the rest behind
   "More", and restyle its cards in the My Duties style (big check targets).
7. **Daily GM routines.** Recurring duties support weekly → yearly only (database
   rule). If there are daily GM routines (opening checks, frost delay
   call, close-out), add a `daily` cadence (needs a migration).
8. **Unconfirmed duty.** "Submit required MWR/CNIC reporting" is still marked
   NEEDS MANAGEMENT CONFIRMATION. It needs the real report list and due date.

## Found while testing (fixed)

- `useWeather` threw `Cannot read properties of undefined (reading 'temp_f')`
  when the weather service answered without current conditions. It now says
  "Weather is unavailable right now." instead.
