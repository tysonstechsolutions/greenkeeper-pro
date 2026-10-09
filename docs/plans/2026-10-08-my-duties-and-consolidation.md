# My Duties + app consolidation — plan (2026-10-08)

Goal from Tyson: consolidate, upgrade, beautify, and make the app make sense,
so daily, weekly, monthly, quarterly, and yearly duties are easier to get done.

## Done — round 1 (commit dab40f2)

- **My Duties** (`/my-duties`) is the new home: tabs for Today, Week, Month,
  Quarter, and Year.
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
- Weather widget no longer throws when the weather service answers without
  current conditions. It says "Weather is unavailable right now."

Code: `src/lib/rhythm/` (pure logic, tested), `src/components/features/rhythm/`,
`src/app/my-duties/page.tsx`.

## Done — round 2 (approved by Tyson 2026-10-09)

- **Duty & Cleaning Log → History tab on Duty Ownership**
  (`/operations/duties?tab=history`). `/duty-log` forwards there. The
  Restaurant hub card is now "Duty History" and opens that tab.
  - **Bug fixed along the way:** the old log only read `duty_completions`,
    which stopped receiving rows when the duty system moved check-offs onto
    duty tasks (2026-07-13). It showed nothing new after mid-July. History now
    reads both sources and shows each check-off once. It also has a time range
    (30 days / 90 days / 12 months) and a Verified marker.
- **"Shop Duties" card removed** from the Pro Shop hub. It only opened Duty
  Ownership. The schedule page's Duties button now goes straight there.
- **GM Dashboard merged into Money.** The Money page now has the financial
  alert, the Financial Watch card, and live PR counts ("Awaiting approval",
  and "Open PRs" = not yet received). `/gm` forwards to `/money`. The
  Leadership Briefing, whose only link was on the GM Dashboard, got its own
  card in the Money hub. The old "My Day" card on the GM page was dropped
  (My Duties replaces it).
- **One Assets page with Inventory and Readiness tabs.** `/equipment` forwards
  to `/assets?tab=readiness`. The Fleet plan (`/equipment/readiness`) and Data
  completeness pages are linked from the Readiness tab, and their back links
  return to it. Course & Range hub: one "Equipment Readiness" card instead of
  "Equipment" + "Fleet Readiness".

## Waiting on Tyson

1. **Two standards pages** — not answered yet. `/standards` is the live
   scorecard and `/standards-plan` is the static FY24 assessment. Proposal: FY24
   becomes a read-only *Baseline* tab inside Program Standards.
2. **His duty list.** Tyson will send his daily, weekly, monthly, quarterly,
   and yearly tasks. Then:
   - add a `daily` cadence for recurring duties (needs a migration: the
     database only allows weekly through annual today);
   - load the list as recurring duties;
   - replace the placeholder "Submit required MWR/CNIC reporting" (still marked
     NEEDS MANAGEMENT CONFIRMATION) with the real reports and due dates.

## Later candidates (not asked about yet)

- **Purchasing.** Procurement hub, Purchase Requests, PR Audit, Order List,
  Create PR. Proposal: PR Audit becomes a tab on Purchase Requests.
- **Operations Command Center is dense.** It has 14 sections and 12 filters. Proposal:
  open on 4 sections (Overdue, Today, This week, Waiting), with the rest behind
  "More", and restyle its cards in the My Duties style.
