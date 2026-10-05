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
   completed one — FY2026 on 2026-10-02). Progress, **"Rate the crew side by
   side"** (main path), "Start next", "Print all finished" (one PDF),
   "Editable copies (.zip)".
   - `/staff/evaluations/crew?fy=<year>`: first "Who supervises other
     people?" (pre-checked by role or direct reports), then one element at a
     time with everyone on screen (f–h only for supervisors). Each tap saves;
     saves per person run in order so quick taps never create duplicates.
     Finishing jumps to the first person's questions.
2. `/staff/evaluations/edit?employee=<id>&fy=<year>`:
   - **Rate** — reason for rating, supervisor toggle, one tap per element
     (shows the form's description of the chosen level), optional example.
     A panel shows what the app already knows for the period.
   - **Questions** — did well (required), work on, goals, training (IDP 7),
     classes/conferences (IDP 8), anything else, item 8 awards. Under each
     question, **"From your 1:1s"** lists the GM's own recorded 1:1 answers
     (and engagement-profile career goals) that match it, with Add / Add all.
     Matching is by what the 1:1 question asked (`suggestions.ts`); questions
     about the GM ("what do you hope I do differently") are never used.
   - **Review** — overall rating (suggested), "Write it up" drafts item 9 and
     the IDP; everything editable; "Preview the form".
   - **Done** — finalize locks it, files the filled PDF on the employee's
     profile (Documents → Performance Review, private bucket; managers only),
     lists the signing steps from the form's instructions, "Next: <person>".
   - Autosaves ~1 s after each change.

## Ideas not built yet (discussed with Tyson 2026-10-02)

1. Track after finalize: approving official signed → discussed → copy given
   (2-week deadline reminder in My Day).
2. ~~90-day evaluation reminders from hire dates.~~ Built 2026-10-05, see below.
3. Separation/close-out prompt when someone is marked leaving.
4. Enter last-4 SSN at download (not stored).
5. Crew totals for pay increases / awards.
6. "For my eval" tag on wins during the year.

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

## New hires and 90-day evaluations (2026-10-05)

- Anyone hired fewer than 90 days before Sep 30 gets no yearly evaluation for
  that fiscal year. They drop off the yearly list (and the crew screen) and
  show in a "Not due" note with their 90-day mark. A yearly evaluation that
  was already started stays on the list. No hire date means they stay on.
- Every new hire gets a 90-day evaluation at hire date + 90 days. The list
  page shows a "90-day evaluations" section from 30 days before the mark
  until 90 days after it (Coming up / Due now / Overdue), plus any unfinished
  one. Opened at `/staff/evaluations/edit?employee=<id>&kind=90day&start=<hire date>`.
- A 90-day evaluation is its own row (`rating_reason = ninety_day`, period =
  hire date through the mark). Migration `20261005120000_ninety_day_evaluations.sql`
  lets it share a start date with a yearly row (someone hired Oct 1).
- Rules live in `src/lib/evaluations/period.ts` (`needsAnnualEvaluation`,
  `ninetyDayPeriod`, `ninetyDayTiming`) and `splitRoster` in `use-evaluations.ts`.

