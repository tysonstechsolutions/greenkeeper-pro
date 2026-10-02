# Yearly Evaluations — design (2026-10-02)

## Goal

Tyson answers a short interview per employee; the app fills out the yearly
evaluation paperwork for the whole crew.

## Status

- Built against a **generic NAF-style layout** (8 rated elements, 5-level
  scale, overall rating, 4 written sections, signature lines).
- **Waiting on the official sheet.** Tyson will upload the form he works off.
  When it arrives, map it in `src/lib/evaluations/form.ts` (elements, rating
  labels, section titles, signature lines) and bump `FORM_VERSION`. If the
  sheet is a fillable PDF, add a pdf-lib filler like `sf52-report.ts` instead
  of the drawn layout in `src/lib/evaluations/pdf.ts`. The interview, drafting,
  saving and roster don't need to change.

## Flow

`/staff/evaluations` (People & Paperwork → Evaluations, also matched from
My Day tasks like "do yearly evals")

1. Roster for the rating period (federal FY; defaults to the most recently
   completed one — FY2026 on 2026-10-02). Shows progress, "Start next", and
   "Print all finished" (one combined PDF).
2. `/staff/evaluations/edit?employee=<id>&fy=<year>`:
   - **Rate** — one tap per element (1–5), optional one-line example. A
     collapsible panel shows what the app already knows for the period
     (call-outs, sick time, 1:1s and their summaries, follow-ups,
     disciplinary records, certifications).
   - **Questions** — what they did well (required), what to work on, goals,
     training, anything else.
   - **Review** — overall rating (suggested = rounded average; any
     Unacceptable caps it at Needs Improvement), then "Write it up" drafts
     the sections. Everything is editable.
   - **Done** — finalize locks it, files a PDF copy on the employee's profile
     (Documents → Performance Review, private bucket; managers only), and
     offers "Next: <person>".
   - Autosaves ~1 s after each change.

## Drafting

- `supabase/functions/staff-evaluation-draft` (Claude) writes the sections
  from the ratings + notes + facts. Rules: never invent; they/them pronouns;
  attendance only under Dependability; no disciplinary/personal content
  unless the GM's notes raise it.
- If the function isn't deployed or fails, `compose.ts` writes the draft from
  the GM's own words, so the paperwork can always be finished.

## Data

`staff_evaluations` (migration `20261002120000_staff_evaluations.sql`): one
row per employee per period (unique). Same trust boundary as 1:1s —
`can_manage_staff_member()` (managers + the recorded direct supervisor).
Actor attribution forced by trigger. No deletes. Final rows are locked; only
a manager can reopen. Verified against a local Postgres 16 with the real
helper functions (supervisor/manager/outsider, lock, reopen, delete,
duplicate period, period move).

## To go live

1. Apply the migration.
2. `supabase functions deploy staff-evaluation-draft` (uses the existing
   `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` secrets). Optional — without it the
   built-in writer drafts.
