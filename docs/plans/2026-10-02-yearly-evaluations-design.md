# Yearly Evaluations — design (2026-10-02)

## Goal

Tyson answers a short interview per employee; the app fills out the yearly
evaluation paperwork for the whole crew.

## The form

**CNIC 5300 — CNIC Non-Appropriated Fund Employee Performance Rating Form
(Rev. 9 Sept 2025)** plus its **Individual Development Plan** page. Tyson
uploaded the official fillable PDF; it lives at
`public/templates/naf-performance-appraisal-cnic-5300.pdf` and the app fills
it in place (pdf-lib), leaving fields editable for the last 4 of the SSN and
CAC signatures.

- Elements a–e for everyone; f–h (Leadership, Management/Coaching/EEO,
  Internal Controls) only for supervisors ("Supervises other people" toggle;
  defaults on for supervisory roles or anyone with direct reports).
- Scale: Outstanding, Highly Satisfactory, Satisfactory, Minimally
  Satisfactory, Unsatisfactory.
- Form rule enforced: any Unsatisfactory element ⇒ overall Unsatisfactory.
  The app warns that an Unsatisfactory must be delayed and needs a Letter of
  Caution.
- Item 8 pay increase / performance award / time-off award: Yes/No + amount
  (defaults to No).
- Item 9 remarks = summary + accomplishments + areas to develop + goals. If
  it won't fit the box at ≥7.5 pt, the box says "see continuation sheet" and
  a continuation page is inserted after page 1.
- IDP: name, position, work schedule, hire date, next FY as the IDP period,
  learning opportunities a–c, conferences a–c, remarks.
- Left blank on purpose: SSN, all signatures and signature dates.

Field-name mapping (several fields are generic, e.g. `Check Box1` = overall
Highly Satisfactory, `Text5/6/7` = item 8 amounts) is documented in
`src/lib/evaluations/pdf.ts`; it was made by matching each widget's position
to the printed form, and every name is checked by tests.

## Flow

`/staff/evaluations` (People & Paperwork → Evaluations, also matched from
My Day tasks like "do yearly evals")

1. Roster for the rating period (federal FY; defaults to the most recently
   completed one — FY2026 on 2026-10-02). Progress, "Start next",
   "Print all finished" (one PDF), "Editable copies (.zip)".
2. `/staff/evaluations/edit?employee=<id>&fy=<year>`:
   - **Rate** — reason for rating, supervisor toggle, one tap per element
     (shows the form's description of the chosen level), optional example.
     A panel shows what the app already knows for the period.
   - **Questions** — did well (required), work on, goals, training (IDP 7),
     classes/conferences (IDP 8), anything else, item 8 awards.
   - **Review** — overall rating (suggested), "Write it up" drafts item 9 and
     the IDP; everything editable; "Preview the form".
   - **Done** — finalize locks it, files the filled PDF on the employee's
     profile (Documents → Performance Review, private bucket; managers only),
     lists the signing steps from the form's instructions, "Next: <person>".
   - Autosaves ~1 s after each change.

## Drafting

- `supabase/functions/staff-evaluation-draft` (Claude) writes item 9 and the
  IDP from the ratings + notes + facts. Never invents; they/them pronouns;
  attendance only under Dependability; no disciplinary/personal content
  unless the GM's notes raise it; item 9 kept to ~180 words to fit the box.
- If the function isn't deployed or fails, `compose.ts` writes the draft from
  the GM's own words, so the paperwork can always be finished.

## Data

`staff_evaluations` (migration `20261002120000_staff_evaluations.sql`): one
row per employee per period. Columns for rating reason, supervisory, ratings,
overall, awards, answers, narrative (item 9 + IDP), facts snapshot. Same
trust boundary as 1:1s (`can_manage_staff_member()`), forced actor
attribution, no deletes, final rows locked, only a manager can reopen.
Verified against a local Postgres 16 with the real helper functions.

## To go live

1. Apply the migration.
2. `supabase functions deploy staff-evaluation-draft` (uses the existing
   `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` secrets). Optional — without it the
   built-in writer drafts.
