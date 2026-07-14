# Design — Global Search, Receipt Upload+Match, Dynamic 1:1 System

Date: 2026-07-14
Status: Approved, ready to build (all three in one pass)
Branch: main (per Tyson — stay on main)

Three independent features requested together. Deployment note: new Supabase
edge functions and any SQL migrations are applied/deployed by Tyson himself
(never `git push`, never auto-deploy). This doc lists exactly what he must run.

---

## Feature 1 — Global App Search (⌘K command palette)

### Goal
One place to jump to any page/tool OR any record (staff, PR, vendor) by typing.

### Building blocks that already exist
- `cmdk` is installed; `src/components/ui/command.tsx` (shadcn CommandDialog) exists
  but is unused — wire it up.
- `src/lib/layout/app-catalog.ts` — `APP_CATALOG` (per-role) + `HUBS` with nested
  `children`. Entry shape: `{ href, label, icon, color, pinned?, group?, children? }`.
  No keyword field today.

### Design
- **New component** `src/components/features/search/global-search.tsx` — a
  `CommandDialog` with `CommandInput` + grouped `CommandList`.
- **Mount point**: `src/components/layout/app-shell.tsx` (renders app-wide, skips
  public routes). Holds open/close state + a global `keydown` listener for
  `Cmd/Ctrl+K`.
- **Trigger button**: add a search icon/box to `src/components/layout/header.tsx`
  (visible on mobile too — tap to open). Opens the same dialog.
- **Result groups**:
  1. **Pages & Tools** — flatten `getCatalog(flags)` + recurse `HUBS[*].children`
     into a deduped `{ href, label, icon, group }[]` (memoized once). Instant,
     in-memory fuzzy match on label + optional keyword aliases.
  2. **Staff** — debounced (~200ms) query `profiles` by name → `/staff/profile?id=`.
  3. **Purchase Requests** — query `purchase_requests` by PR number / vendor →
     `/purchase-requests/view?id=`.
  4. **Vendors** — query `vendors` by name → vendor route.
- **Keyword aliases**: add optional `keywords?: string[]` to `AppEntry` and set a
  few high-value ones ("PR"→Purchase Requests, "PTO"/"time off"→schedule, etc.).
- Selecting a result: `useRouter().push(href)` and close.
- Record queries capped (e.g. 6 each), only fire when query length ≥ 2, and are
  cancellable (ignore stale responses).

### Files
- New: `src/components/features/search/global-search.tsx`
- Edit: `src/components/layout/app-shell.tsx` (mount + shortcut),
  `src/components/layout/header.tsx` (trigger),
  `src/lib/layout/app-catalog.ts` (add `keywords?`, a flatten helper, a few aliases).

### No migration, no edge function.

---

## Feature 2 — Receipt Upload + AI Match (PR reconciliation)

### Goal
On a `received` PR that still needs a receipt, click the badge → upload a PDF/image
receipt → AI reads it, matches it line-by-line against the PR, you confirm → saved.

### Building blocks that already exist
- Columns already present on `purchase_requests`: `actual_amount`, `receipt_path`,
  `reconciled_at` (migration `20260702_money_phase2.sql`).
- `prNeedsReceipt(pr)` = `status === "received" && actual_amount == null`
  (`src/lib/pr-reconciliation.ts`). Badge rendered at
  `src/app/purchase-requests/page.tsx:751-756` and a manual reconcile form at
  `src/app/purchase-requests/view/page.tsx`.
- Proven AI doc→line-items extractor: `supabase/functions/extract-quote`.
- Line-item match precedent: `audit-pr-fit` + `src/lib/pr-audit/fit.ts`.
- Upload helpers: `uploadQuoteFiles` (→ `vendor-files` bucket) and
  `uploadPhoto` (→ `photos`). `directInsertRow`/`directPatchRow` in
  `src/lib/supabase/rest.ts`.

### Design
- **Badge → button**: the "Needs receipt" badge becomes a button that opens a
  **Receipt sheet** (new component). `accept="application/pdf,image/*"` (PDFs are a
  first-class case — most receipts are PDF).
- **New edge function** `supabase/functions/extract-receipt/index.ts` — cloned from
  `extract-quote`. Accepts multipart file or `{ image_base64, media_type }`; PDF via
  `type:"document"` + `anthropic-beta: pdfs-2024-09-25`; reads `ANTHROPIC_MODEL`
  (fallback current Sonnet), temp 0. Returns:
  `{ vendor, purchase_date, subtotal, tax, total, items:[{description, qty, unit_price, line_total}], warnings }`.
- **Storage**: upload to `vendor-files` bucket at `receipts/${prId}/receipt-<ts>.<ext>`
  → save to `receipt_path`. (Read-back via `publicStorageUrl`/signed URL as
  appropriate; PR files are private.)
- **Match step** (`src/lib/pr/receipt-match.ts`, deterministic + reuses parsed data):
  - Overall: receipt `total` vs `prSubmittedTotal(pr)` → variance (existing helper).
  - Per line: align receipt items to `pr.items` (by fuzzy description / part) → mark
    each `match | price_diff | missing_on_receipt | extra_on_receipt`.
- **Review UI** in the Receipt sheet: header "✓ Matches" or "⚠ N differences", a
  line table, editable actual total. Confirm → patch `actual_amount`,
  `receipt_path`, `reconciled_at`, and store parsed+match JSON (new nullable
  `receipt_data jsonb` column — see migration). PR then shows its variance badge.

### Files
- New: `supabase/functions/extract-receipt/index.ts`,
  `src/lib/pr/receipt-extract.ts` (client wrapper for `callApi("extract-receipt")`),
  `src/lib/pr/receipt-match.ts`,
  `src/components/features/purchase-requests/receipt-sheet.tsx`.
- Edit: `src/app/purchase-requests/page.tsx` (badge→button opening the sheet),
  `src/app/purchase-requests/view/page.tsx` (offer the same sheet in the
  Reconciliation section), `src/lib/api/client.ts` (register `extract-receipt` as a
  slow/direct AI route).

### Migration
`ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS receipt_data jsonb;`

### Tyson must run
- Apply the migration (Management API, per existing process).
- `supabase functions deploy extract-receipt`.

---

## Feature 3 — Dynamic, Personal 1:1 System

### Goal
Run 1:1s in-app (no printing); questions get personal and evolve per employee;
follow-ups carry forward; the assistant turns what's said into real updates
(tasks, time-off, scheduling prefs, follow-ups, calendar); a monthly report finds
crew-wide themes.

### Building blocks that already exist
- Staff profile `/staff/profile` "1:1s" tab (`src/app/staff/profile/page.tsx`):
  today = Schedule a 1:1 (`staff_one_on_ones`), Concerns (`staff_concerns`),
  free-text "Log a 1:1" (→ `staff_records` type `one_on_one`).
- Question sets you like live as markdown worksheets in
  `src/lib/onboarding/default-documents.ts`: `gm-first-one-on-one` (transition),
  `gm-30-day-checkin`, `gm-standard-one-on-one`.
- Grounded-AI narration precedent: `financial-advisor` edge fn + snapshot pattern.
- Card-approve-then-commit precedent: `src/components/briefing/leadership-briefing-review.tsx`.
- Write targets confirmed: My Day (`useMyDay.addQuickStep/addGoal`),
  time-off (`useTimeOff.submitRequest` → `time_off_requests`),
  calendar (`useCalendar.addCalendarEvent`), follow-ups (`staff_concerns`).
  No hours-preference field exists → add one in `personnel_details` JSON.

### Data model (new)
- **`staff_one_on_one_sessions`**
  `id, employee_id, session_date, template (transition|thirty_day|monthly|custom),
   status (draft|completed), questions jsonb [{id, section, prompt, answer}],
   summary text, scheduled_id uuid null (link to staff_one_on_ones),
   created_by, created_at, updated_at`.
- **`staff_engagement_profiles`** (one row per employee)
  `employee_id (PK), profile jsonb { interests[], family[], career_goals[],
   sports[], life_goals[], communication_notes, misc[] }, updated_at`.
  AI-maintained; the memory that makes questions personal.
- **Follow-ups**: reuse `staff_concerns`; **rename to "Follow-ups" in the UI only**
  (no table rename). Used for both casual and formal items.
- **Hours preference**: write `personnel_details.scheduling_preference` (string)
  — surfaced on the Info tab; no migration (JSONB).

### Session flow (staff profile "1:1s" tab)
1. **Start a 1:1** → choose template.
   - Transition / 30-Day: static question sets (ported from `default-documents.ts`,
     expanded with more questions).
   - **Monthly**: call new `one-on-one-questions` edge fn → personalized set from
     engagement profile + last N sessions + open follow-ups.
2. Session form: sections + answer boxes. **Open follow-ups shown at the top**
   ("Follow up from last time: …").
3. **Save** → row in `staff_one_on_one_sessions`; mark linked scheduled 1:1
   completed.
4. **Post-session AI** → new `one-on-one-digest` edge fn reads the answers and
   returns: (a) engagement-profile updates, (b) a short summary, (c) a list of
   **proposed actions** typed for routing.
5. **Review card** (leadership-briefing-review style): each proposed action shows
   with ✓ / ✗ / edit, then one **Apply**. Only on Apply do writes happen.

### Action routing (verify-then-commit — nothing writes without Apply)
| Detected | Action type | Write target |
|---|---|---|
| Task for Tyson | `task` | `useMyDay.addQuickStep/addGoal` (due date) |
| Wants more/less hours | `hours_pref` | `personnel_details.scheduling_preference` |
| Day off / vacation | `time_off` | `useTimeOff.submitRequest` (vacation/personal) |
| Frustration / open issue | `follow_up` | `staff_concerns` (new open follow-up) |
| Personal fact | `profile` | `staff_engagement_profiles.profile` |
| Meeting / dated event | `calendar` | `useCalendar.addCalendarEvent` |

### Monthly Insights Report
- **New page** `src/app/staff/insights` (or a button on `/staff`).
- Deterministic digest (`src/lib/oneonone/insights.ts`): gather completed sessions
  in the period + open follow-ups across all employees → grounded snapshot
  (per-employee summaries + theme tallies).
- **New edge fn** `one-on-one-report` (modeled on `financial-advisor`, strict
  "snapshot is your only source"): returns common themes (pay, inter-employee
  friction, workload, equipment), counts, suggested actions.
- Render on screen; savable to `/documents` via `saveCreatedDocument`.

### Files (Feature 3)
- New edge fns: `supabase/functions/one-on-one-questions/`,
  `supabase/functions/one-on-one-digest/`, `supabase/functions/one-on-one-report/`.
- New lib: `src/lib/oneonone/{types,templates,use-oneonone,insights}.ts`.
- New components: session runner, post-session review card, insights report,
  under `src/components/features/oneonone/`.
- Edit: `src/app/staff/profile/page.tsx` (replace free-text 1:1 with the runner;
  rename Concerns→Follow-ups; add scheduling-preference on Info tab),
  `src/lib/api/client.ts` (register the 3 edge routes),
  `src/lib/staff/types.ts` (types), catalog entry for insights if a page.

### Migration (Feature 3)
`staff_one_on_one_sessions` + `staff_engagement_profiles` tables (with permissive
authenticated RLS matching existing staff tables + `updated_at` triggers).

### Tyson must run
- Apply the Feature-3 migration.
- `supabase functions deploy one-on-one-questions one-on-one-digest one-on-one-report`.

---

## Build order (single pass)
1. Migrations (receipt_data; 1:1 tables) — authored as SQL files for Tyson to apply.
2. Edge functions (extract-receipt; 3× one-on-one) — authored + committed.
3. Feature 1 (search) — self-contained, ship first / fast.
4. Feature 2 (receipt sheet + match) — depends on extract-receipt.
5. Feature 3 (1:1 runner, action routing, insights).
6. Tests where the app has coverage (match logic, templates, insights digest are
   pure functions → unit-test them).
7. `npm run build` / typecheck clean, then commit.

## Guardrails carried from existing conventions
- Theme tokens only (no hardcoded bg-white/gray) — [[theme-tokens-convention]].
- AI edge fns read `ANTHROPIC_MODEL` env first — [[ai-edge-functions]].
- Aggregates via views, never raw-row fetch (insights digest) —
  [[operating-rhythm-phase1]].
- Grounded AI: deterministic data → AI narrates, never invents (report/match).
- Auto-commit when done; never push — [[commit-dont-push]].
