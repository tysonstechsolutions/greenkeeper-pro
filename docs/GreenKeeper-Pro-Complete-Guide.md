# GreenKeeper Pro — Complete Guide

*How the app is supposed to work: every feature, program, form, and AI capability, and everything anyone would need to know to run it.*

Last updated: 2026-07-01

---

## 1. What this app is

**GreenKeeper Pro** is the all-in-one management app for **Veterans Memorial Golf Course (VMGC)** in Great Lakes, IL — a Navy MWR / NAF-funded course. It runs three sides of the operation from one shared database:

- **Course & turf operations** — the superintendent's daily work: the course map, observations, irrigation, chemicals, weather, assets, crew scheduling, and reports.
- **Business & administration** — the General Manager's world: budgets, purchase requests, revenue, tournaments, board reports.
- **Procurement oversight** — the Business Division Head's world: auditing purchase requests against federal accounting rules and cost-center budgets.

It is built to work with a **very small crew** (roughly three maintenance employees), where the superintendent also carries a heavy admin/paperwork load. Everything is designed to keep task and schedule generation small and realistic, and to turn slow federal paperwork (POs, sole-source justifications, DD forms, SF-52s) into a few taps.

### Platform at a glance

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Supabase — PostgreSQL, Auth, Storage, Realtime, Edge Functions |
| AI | Anthropic Claude (via Supabase Edge Functions) |
| Weather | WeatherAPI.com (proxied server-side) |
| Offline / installable | PWA with a Serwist service worker + IndexedDB write queue |
| Mobile app | Packaged as a native **Android** app via Capacitor (barcode scanner, camera, push, filesystem, share) |
| Monitoring | Sentry, Vercel Analytics / Speed Insights |
| PDFs | Client-side jsPDF / jspdf-autotable / pdf-lib (no server render) |

The app is a **static export**: `next.config.ts` exports HTML/JS to `out/`, which is what both the web PWA and the Android APK ship. Because there's no Next.js server in production, all server logic lives in **Supabase Edge Functions** (Deno). The app also works fully offline — writes queue locally and replay when connectivity returns.

---

## 2. Who uses it: the three "views"

The app has **no per-user roles or logins anymore**. Instead, everyone shares a kiosk sign-in, and what you see is driven by a **view ("hat")** you pick, not by who you are. All three views read and write the **same data** — they just surface different parts of it.

| View | Who it's for | Home screen | Focus |
|---|---|---|---|
| **Superintendent** (`super`) | Turf & crew | `/dashboard` | Course map, tasks, schedule, irrigation, chemicals, assets, reports |
| **General Manager** (`gm`) | Business/admin | `/gm` | Budget, purchase requests, reports, revenue, tournaments, financial watch |
| **Business Division Head** (`bdh`) | Procurement oversight | `/pr-audit` | PR audit, budgets, reports, revenue, capital projects |

You switch hats from the header; the choice is remembered on the device (localStorage). The menus (sidebar on desktop, "More" grid on mobile, bottom nav) reconfigure automatically for the chosen view. Menu contents come from **one shared catalog** (`src/lib/layout/app-catalog.ts`) so the sidebar and mobile grid never drift apart. Legacy `RoleGuard` components still exist but are pass-through — nothing is role-gated.

### Signing in

- **Shared PIN (kiosk):** The app uses a shared 4–6 digit **PIN (9999)** that auto-signs in a kiosk account (`kiosk@vmgc.app`). PIN entry is verified by an edge function against a `pin_codes` table, which returns a real Supabase session. PIN attempts are rate-limited (5/minute per IP).
- **Auto-login:** On the Android build, a stored PIN can auto-sign-in on launch, so the app opens straight to the dashboard.
- **Deploy requirement:** The kiosk credentials come from environment variables (`NEXT_PUBLIC_APP_EMAIL`, `NEXT_PUBLIC_APP_PASSWORD`, `NEXT_PUBLIC_APP_PIN`).
- Legacy email login (`/login`) and invite acceptance (`/invite/accept`) still exist in code.

---

## 3. How the AI works (read this before trusting any AI output)

AI is used **strategically and cost-consciously**, and it never invents numbers on financial or accounting work. Three principles govern every AI feature:

### a) Deterministic first, AI narrates second
For anything with money or compliance (PR audits, budgets, Financial Watch), a **pure, repeatable engine** does the math first. The AI only explains the already-computed result in plain English — it is never handed raw data to "figure out" a total. This is why an audited PR and a built PR can never disagree.

### b) Library-first: reuse free answers before paying
Every AI text generation routes through a **"library-first"** flow (`src/lib/ai/`):
1. **Check the AI Library** (`ai_library` table) for a past answer to a similar request, using Postgres trigram similarity (default match threshold 0.30). A good match is reused **for free** and its use-count bumps.
2. **Otherwise call Claude** (paid), then save the answer back to the library for next time.
3. **If the AI is unreachable** (offline), lower the match threshold and try the library again; if still nothing, fall back to a **built-in template**.

The result is that the app **always has something to show** — it degrades gracefully instead of erroring. You can browse and manage reused answers at **`/ai-library`**.

### c) A hardcoded Claude model — and what "AI temporarily unavailable" means
Each edge function **hardcodes a specific Claude model**. When Anthropic retires that model, the affected function starts returning **502s** and the app shows something like *"AI temporarily unavailable"* or *"Couldn't reach the AI writer."* **The fix is always the same:** update the model constant in the function(s) and redeploy (`supabase functions deploy`). No Docker is needed; the CLI token lives in Windows Credential Manager. This is the single most common AI outage cause — if multiple AI features fail at once, suspect a retired model, not a bug.

### The AI Assistant (`/assistant`)
A full **read/write chat** that is "the superintendent's right-hand tool." It runs a **tool-use loop** (capped to a handful of rounds so it can't loop forever) with tools to search and change real data: search/create/update tasks, search equipment/chemicals/staff/schedule, get weather, get budget summary, add/update order-list items, report a course issue, update equipment status. Every tool call still runs through the database's row-level security. Its persona is locked to helping the golf course; framing off-topic requests as course work is required (this also affects SOW/Sole-Source prompts).

### The AI edge functions (complete list)
All live in `supabase/functions/`. Shared helpers (`_shared/`) handle CORS, JWT auth, and Supabase clients.

| Function | What it does |
|---|---|
| `ai-assistant` | The read/write assistant chat with the tool-use loop (above). |
| `task-breakdown` | My Day: breaks a task title into 2–12 ordered steps. |
| `task-directions` | Turns a task + course location into site-specific directions ("approach #5 green from the south, back-left"). |
| `bulk-tasks` | Parses freeform text into multiple structured task records. |
| `morning-route` | AI crew scheduler: assigns the day's tasks to crew by skills/weather/tee-times; falls back to round-robin if AI is off. |
| `daily-briefing` | Scheduled (via `pg_cron`) morning briefing: staff on duty, priority tasks, alerts, weather, recap. Uses a shared secret, not a user login. |
| `spray-window` | Given weather (temp/humidity/wind/GDD), returns safe pesticide application windows respecting REI. |
| `fix-instructions` / `green-fix-instructions` | Step-by-step repair checklists for a turf/green issue; deterministic template fallback offline. |
| `extract-pr` | Vision: transcribes a filled NAF Purchase Request **exactly as printed** (so the audit can catch data-entry errors). |
| `extract-quote` | Vision: reads a vendor quote/invoice into structured line items and totals. |
| `extract-889` | Vision: reads a Section 889 compliance form (contractor, status, SAM.gov, expiry). |
| `extract-staff-doc` | Vision: reads staff documents/IDs (name, dates, credential numbers) for profile auto-fill. |
| `audit-pr-fit` | Vision: transcribes a PR form for the audit tool to validate. |
| `financial-advisor` | GM advisory chat — analyzes a **snapshot** of already-computed budget/revenue metrics; only references numbers in the snapshot, never invents. |
| `pro-shop-ai` | Parses plain-English availability into weekly patterns, suggests shift coverage, and parses schedule-update notes. |
| `translate` | Cache-first English ↔ Spanish translation for crew notes; repeat strings never re-hit the API. |
| `get-weather` | Server-side proxy to WeatherAPI.com (keeps the API key off the client; short cache). |
| `drone-upload` | Handles large GeoTIFF/imagery uploads and records drone-flight metadata (band, source, bbox). |
| `pin-login` / `pin-signup` | Kiosk PIN auth (deployed `--no-verify-jwt`); signup prints a PIN for a laminated card. |
| `push-subscribe` / `push-send` | Register devices and dispatch push notifications (web VAPID + native FCM), pruning dead subscriptions. |

---

## 4. Home screens

### Superintendent Dashboard (`/dashboard`)
The turf command center: weather widget, a course-status banner, today's priority tasks, a mini course map, recent activity, quick actions (customizable), push opt-in, and a printable daily-assignments report. Weather-driven alerts (frost, wind, rain) surface here.

### GM Dashboard (`/gm`)
The business counterpart: a **Financial Watch** health card and alert banner, a **My Day** card, pending/active purchase-request counts, and quick tiles to Budget, PRs, PR Audit, Reports, Revenue, Tournaments, Capital Projects, Onboarding, and Staff.

### BDH landing (`/pr-audit`)
Opens straight into the PR Audit queue.

---

## 5. Daily planning & scheduling

### My Day (`/my-day`)
A **personal** daily plan for the superintendent/GM (distinct from crew tasks).

- **Add a task** with an optional **deadline** and **repeat** setting (one-time, daily, weekly, monthly, quarterly, yearly).
- The AI (`task-breakdown`) splits it into steps; the app **spreads the steps across the days before the deadline**, finishing with a buffer (default ~2 days early) so nothing is last-minute. No deadline → steps land in a **Backlog** to pull from when there's time.
- **Capability tasks:** if a title matches a known tool (e.g., "SF-52", "purchase request", "onboarding"), My Day links straight to that form instead of making generic steps.
- **Today's list** shows everything due today or overdue (overdue rolls in automatically). Check items off; done items disappear.
- **Recurring rollover:** when a repeating task's deadline passes, the next occurrence is auto-created with the same steps re-spread across the new window. Monthly/quarterly/yearly repeats are **end-of-month aware** (a task due on the last day stays end-of-month). A **Recurring** section shows each active series' health.
- **PR hook:** when a Purchase Request is marked **"received,"** My Day auto-creates an **urgent 24-hour paperwork task** ("take the receipt to Building 1 / guard mail"); it auto-completes when the PR reaches "receipt signed."
- **Bulk import:** paste a list of tasks (with/without deadlines) and add up to 100 at once.

### Tasks (`/tasks`)
Crew task management (kept in the app, reachable by deep link even though it's off the top menu). Create tasks with title, description, category, priority, assignee (person **or** crew), due date/time, estimated minutes, zone, hole numbers, equipment/materials, checklist, photo-before/after requirements, weather dependency, and an optional **recurrence rule (RRULE)**. Tasks flow **pending → in progress → completed → verified**. Titles/descriptions auto-translate to Spanish on save. Real-time sync keeps every view current. **Task templates** store reusable defaults so you don't re-enter equipment lists and checklists each time.

### Crew Schedule board (`/schedule`)
A unified weekly planner combining **shifts, task assignments, and time-off** in one grid (staff rows × Sun–Sat).

- **Desktop:** three panes — reusable **task templates** (left), the **week grid** (center), an **inspector** (right). Drag a template into a cell to spawn a task; drag a task between cells to reassign; approved **time-off** blocks the cell background.
- **Mobile:** crew get a single-column **today view** (tap to complete); managers get a per-day editor sheet.
- **Suggest:** generates a default crew schedule from the pro-shop shift templates.
- **Print** the week as a PDF to post. Deleting a recurring task offers "just this one" vs. "this and all future."
- Related pages: **morning** schedule (`/schedule/morning`), **time-off** (`/schedule/time-off`), **crews** (`/staff/crews`).

### Calendar (`/calendar`)
A month view that **aggregates** tournaments, staff 1:1 meetings, generic calendar events (F&B events, appointments, meetings, deadlines, other), and **My Day task deadlines** — color-coded by kind. Tap a deadline to reschedule; for a recurring task you choose **"move just this one"** (its anchor date stays, so future occurrences keep the original cadence) or **"reschedule the whole series"** (the baseline shifts for all future occurrences). Items deep-link to their source (tournament detail, staff profile, etc.).

---

## 6. Course & grounds

Grouped in the app under the **Course & Grounds** hub (`/grounds`).

### Course Map (`/course-map`)
The heart of daily course management.

- View all 18 **holes** or **greens** as a grid (Front 9 / Back 9), color-coded by issue count and priority.
- Tap a hole/green to open detail, **drop a pin** on the exact problem spot (stored as normalized 0–1 coordinates so crew can find it later), snap a photo, describe it, and set **priority** (critical/high/normal/low) and **issue type** (holes: drainage, compaction, scalping, fairy ring…; greens: fungus, dry/bare spots, moss, grub damage, traffic wear, irrigation…).
- **Fix instructions** can be AI-generated (library-first) or written manually and stored on the observation.
- **Resolve** an observation with proof photos and completion notes. **Resolution History** (`/course-map/resolution-history`) reviews everything fixed by hole/green/date to spot recurring problems.
- **Green area drawing & measurement** (`/course-map/green/measure-at`): freehand-draw the boundary of a disease patch/moss/damage; the app computes **area (sq ft)** and perimeter and stores the polygon — useful for tracking spread and sizing chemical volumes.
- **GPS calibration** (`/course-map/green/hole`, `hole_gps_calibrations`): two reference points per hole map real GPS onto the image so pin placement lines up with the field; recalibrate if GPS drifts.
- Observation titles/descriptions auto-translate to Spanish for the crew.

### Pin positions
Daily hole-cup placement is tracked (paces from front/left, difficulty, notes) for course setup and pin sheets. There's a **Pin Sheet** report and settings (`/settings/pin-sheet`, `/settings/pins`).

### Irrigation / Sprinkler Map (`/irrigation`, `/irrigation/map`, `/irrigation/schedule`)
Multi-zone irrigation management.

- Define **zones** (rotor/spray/drip/bubbler/manual; target green/tee/fairway/rough/practice; GPM, head count).
- Build a **watering plan**: target depths per surface (e.g., greens 0.15″, tees 0.2″, fairways 0.4″), application rates, active days, a **concurrency cap** (how many zones run at once), and an optional finish-by time. Per-hole overrides are supported.
- Browse the schedule, enable/disable zones, and log manual runs/skips (with gallons used and skip reasons).
- The **Sprinkler Map** plots sprinklers/valves/stations and tracks sprinkler issues; dedicated sprinkler reports export to PDF.

### Parking & Paths (`/parking-lot`)
Track asphalt/cart-path issues (pothole, cracking, drainage, erosion, markings, curbing…) with severity, status, estimated cost, assigned crew, photos, and a pinned location.

### Clubhouse (`/clubhouse`)
Track building issues by category (damage, cleaning, needs-ordered, maintenance) with priority, status, cost, photos, and completion date. **Clubhouse issues and Work Orders are linked** (below).

### Weather (`/weather`)
Current conditions + up to a 10-day forecast from WeatherAPI.com (proxied). Log daily observed conditions (high/low, rain/snow, wind) and accumulate **Growing Degree Days (GDD)** for pest/disease timing; feeds monthly board reporting.

### Photos (`/photos`, `/photos/timeline`)
A chronological photo gallery tied to tasks/zones, with caption, tags, photo type (before/after/progress/documentation), and auto-extracted EXIF date/GPS. The **timeline** filters by zone/task/date/type to show work progression.

### Voice Log (`/voice-log`)
Hands-free field capture using the browser's speech recognition: speak an observation, edit the transcript, and turn it into a task or a hole observation.

### Standards Plan (`/standards-plan`)
A long-term improvement roadmap toward USGA-caliber standards, organized by section (Personnel, Facilities, Programs, Equipment, Administration) with priority (P1–P4), owner, the target standard, and current status. Filterable; used for gap analysis and planning. Available in both Superintendent and GM views.

---

## 7. Agronomy & environmental compliance

Grouped under **Environmental & Inspections** (`/environmental`).

### Chemical / pesticide tracking
- **Product catalog:** name, manufacturer, EPA registration, active ingredient, type (fertilizer/herbicide/insecticide/fungicide/PGR/wetting agent/colorant/seed/amendment), signal word, **REI hours**, SDS path, stock, reorder threshold, cost.
- **Application logging:** date/time, product, **applicator license #**, zone(s)/hole(s), area treated, application rate, total used, method (spray/granular/injection/drench), on-site weather (temp/wind/humidity/conditions), target pest, and a link to the triggering task.
- Feeds the **Illinois Restricted Use Pesticide (RUP)** report (`src/lib/compliance/illinois-rup.ts`) and REI-aware **spray-window** guidance.

### Environmental logging
Log incidents by category (stormwater, discharge, buffer zone, spill, waste disposal, fuel storage, wildlife) with severity, corrective action, deadline, and an **NPDES-reportable** flag. Buffer zones (pond, creek, ditch, basin) track required distances, last inspection, and vegetation condition.

### AST inspections (`/ast-inspections`)
Above-ground storage tank inspection checklists (tank, containment, labeling, damage) with photos, compliance status, and a report for regulatory submission.

---

## 8. Assets & equipment

Operational data now lives on **Assets** (`/assets`); the equipment detail views remain.

### FY26 federal assets (`/assets`, `/assets/scan`, `/assets/view`)
Federally funded inventory tracking: asset number, serial, model, manufacturer, **site (7009 / 7010 / 7011 — the course's only three sites)**, and status (unverified → verified-present → MIA → **needs-disposed** → disposed). **Barcode/QR scanning** (native ML Kit on Android) verifies presence; condition photos (front/back/left/right) and dated **damage records** attach to each asset. A full **inventory PDF** exports with photos and statuses.

### Untracked assets (`/assets/untracked`)
Capture assets found without an official tag (new/`no_asset_tag` flow) so nothing is missed at inventory time.

### Asset disposal
When an asset is flagged **"needs disposed,"** the app can carry it straight into the real **DD-200 disposition** form (the disposal hook pre-fills the DD form) — closing the loop between "found broken" and "filed the paperwork."

### Equipment (`/equipment/view`, `/equipment/service-history-view`)
Equipment catalog with parts (name, number, cost, reorder point, stock) and **service records** (date, description, labor/parts cost, technician). Disposal tracking included. Equipment status is also editable via the AI assistant.

---

## 9. Staff, pro shop, tournaments

### Staff management (`/staff`, `/staff/profile`)
A full HR hub for the small crew:
- **Profile:** name, contact, role, hire date, **supervisor (org hierarchy)**, certifications, emergency contact, address, and a `personnel_details` store for custom fields (used by SF-52).
- **Document scan + AI auto-fill:** upload a driver's license/ID/cert and Claude vision (`extract-staff-doc`) reads name, dates, and credential numbers to pre-fill the profile (you confirm before saving).
- **Records timeline** (`staff_concerns`): dated thread of notes, **call-outs, sick time, holiday pay, disciplinary actions, and 1:1s**, filterable by type; call-out/sick reasons are captured.
- **1:1 tracking:** schedule, reschedule (from the calendar), and complete 1:1 meetings with notes; a **concern tracker** keeps open concerns in a dated thread until reconciled (archived).

### Pro Shop Scheduler (`/pro-shop-schedule`)
Schedules the pro-shop staff — **rec aids = outside**, **golf-ops assistants = inside** — for both the Superintendent and GM views.
- Each of the ~9 staff has a **standing weekly availability pattern** (which days, inside/outside, start/end). The month is generated **deterministically** by stamping each pattern across every date, **skipping time-off** (no AI needed).
- **Coverage warnings** flag gaps ("no one outside," "no opener before 10:00," "no closer after 16:00"). Each warning has a stable code so you can **dismiss** it per day (with undo), and dismissals stick even after regenerating. Clicking the ⚠/badge opens **warning triage** to see and fix issues.
- **Flex staff** can cover either area; a shift's area can be overridden individually.
- **Recurring role Duties** (`/pro-shop-schedule/duties`): standing daily tasks assigned to an **area or a person**, recurring on chosen weekdays, with an optional printable checklist.
- **AI help** (`pro-shop-ai`): turn a plain-English availability note into a weekly pattern, suggest who can cover a dropped shift, or parse a schedule-update note ("Aniya out till Jul 25").
- **Publishing** the schedule drops a reminder onto the calendar. The 9 staff also appear on `/staff`.

### Tournaments (`/tournaments`, `/tournaments/view`)
Plan golf events (tournament, outing, league, charity, military, practice) with date(s), expected players, format, shotgun toggle, first tee time, contacts, notes, and a **prep checklist** (course setup, cart maintenance, staffing…). Events appear on the calendar, color-coded by type.

---

## 10. Procurement

Grouped under the **Procurement** hub (`/procurement`).

### Purchase Requests (`/purchase-requests`, `/purchase-requests/new`, `/purchase-requests/view`)
Create NAF/NAVMIDLANT purchase requests and export a proper PDF.
- **Auto-prefill** with facility defaults (facility 8400, golf program, company code, invoice/delivery POCs) and the signed-in user's name/phone.
- **Line items** entered manually or by **uploading a quote** — AI vision (`extract-quote`) reads the vendor PDF/photo and fills vendor name, items, prices, and part numbers without clobbering what you typed. Each line codes **Site / Cost Center / GL Account**.
- **House rules that are always applied** (these are firm business rules for this course):
  - A **3% credit-card fee line item** is added on **every** purchase request (rate editable per-PR; computed on the pre-tax subtotal; always kept last).
  - The **"Other (specify)" attachment box is checked and set to "Vendor Quote"** by default (becomes "Vendor Quote and SOW" when a SOW is attached).
  - **Menards online orders keep a real Sales Tax line** (Menards can't apply the Navy tax exemption at checkout; the vendor refunds later) — and the **3% fee excludes tax**. For all other vendors, extracted tax lines are dropped.
  - **Section 889 compliance** is mandatory (pre-checked); expiry auto-computes to the next Oct 1 after signing.
- **Internal order ID** auto-generates on save as `FY{YY}-GC-{NNNN}`. Lifecycle: **Draft → Not Sent → Sent → Approved → Received.**
- A **SOW** can be drafted with AI or attached from the PR form (see §11).

### PR Audit (`/pr-audit`, `/pr-audit/new`, `/pr-audit/view`, `/pr-audit/budget`, `/pr-audit/codes`)
The BDH's tool to audit **team-submitted** PRs.
- Upload a PR PDF (plus optional quote and 889). AI vision extracts the fields; then a **deterministic engine** validates: every Site/Cost Center/GL code is on the approved list, each line's extended price is correct, exactly one correct 3% fee line exists and is last, sales tax is handled right, the "Other" box says "Vendor Quote," and the printed grand total equals the sum of lines.
- **Findings** are shown as errors/warnings/info with fixes. Missing codes can be added inline.
- **Per-cost-center monthly budgets** (federal fiscal year, Oct–Sep): set annual amounts split across 12 months (with seasonal tweaks); audited PRs "commit" spend to their cost center. Files follow a naming convention (e.g., `QUOTE 1-FY26-JY-001-Vendor-Month`). Official accounting codes (33/74/331…) are pre-imported.

### Order List (`/order-list`)
A running parts/supplies list grouped by category and **consolidated by part number** (a part needed by two machines shows once with combined qty). Mark items **needed → ordered → received**; saving a PR can auto-mark matching items "ordered." Has a Clear-all.

### Vendors (`/vendors`)
A vendor contact + compliance library: POC, phone, email, address, and **Section 889** on file (AI-extracted signatory/UEI/CAGE/expiry). Known vendors (Toro, Russo, Menards, etc.) can be synced from seeded defaults without overwriting your edits. The PR vendor picker pulls from here; an expired 889 warns you.

---

## 11. Paperwork & federal forms

Grouped under the **Paperwork** hub (`/paperwork`). The form fillers **overlay your data onto high-resolution rasters of the real government forms**, so the output is indistinguishable from a hand-completed official document. All generated documents are archived (see §13).

### Statement of Work — SOW (`/sow`, or from the PR form)
Formal Navy contracting document. Choose **"Fill with AI"** (give a work description, requisition type, reason, and dates → Claude drafts 4–6 contractor duties, a goods description, and required certifications, plus auto-filled facility/access/hours/escort details) or **attach a completed PDF**. Everything is editable before the PDF renders. **The 3% fee is excluded from the AI's view** so contractors only see real work. The SOW PDF is a **flowing layout** (page breaks only as needed) and is saved with the PR; edited SOWs are stored per-PR and reused on re-download ("Edit SOW"). The verbosity/tone is tuned in both the content and page modules.

### Sole Source (`/sole-source`)
Federal justification for buying from a single vendor. A wizard collects the request and vendor, then **"Draft with AI"** writes sections 3–8 (description, sole-source characteristics, market research, and — asked explicitly as Yes/No, not silently N/A — compatibility, proprietary data, and direct-replacement rationale). Editable, then overlaid onto the official form. Page-2 boxes are auto-fit so text doesn't bleed. Warns on an expired vendor 889.

### DD Forms — DD-200 & 2212 (`/dd-forms/200`, `/dd-forms/2212`)
In-app fillers overlaying onto blank rasters:
- **DD-200 (property loss/damage/destruction):** site (7009/7010/7011), asset, quantity/cost, circumstance/category, and narrative blocks (what happened / corrective actions) that AI can draft. Save names follow `SITE_x_FY26_GLK`.
- **DD-2212 (NAVCOMPT disposition):** asset, category, disposition (retain/transfer/donate/sell/other), condition.

My Day deep-links into these; the asset "needs disposed" flow pre-fills DD-200.

### SF-52 (`/staff/sf52`)
Fills the official OPM **Personnel Action** form by overlaying onto a 288-DPI PNG of the real form (the XFA original can't be opened directly). Pick an action type and an employee; their position/pay/series/step auto-fill the "TO (new)" fields (data comes from `profiles.personnel_details`; no SSN/DOB stored). Preparer defaults to the current user. Saves to the Documents store.

---

## 12. Budget, revenue & financial oversight

### Budget (`/budget`, `/budget/setup`, `/budget/overview`, `/budget/expenses`, `/budget/expense/new`)
Two parallel budgets:
- **Operating budget** (calendar year): discretionary spend by category (supplies, repairs, utilities…), with YTD-vs-budget, category pie charts, monthly bars, and cost-per-hole / cost-per-acre metrics. Add expenses (vendor, amount, category, invoice date) that flow **pending → approved → paid**.
- **Procurement budget** (federal fiscal year): per-cost-center allocations split into 12 months (rounding absorbed so months sum exactly), with seasonal per-month tweaks; audited PRs commit against it.

### Financial Watch (`/financial-watch`)
A GM/BDH **watchdog** that runs a **deterministic engine** over budgets, spend, and revenue to compute pace, projections, and ranked flags — *then* an AI advisor narrates. It never lets AI invent dollar figures.
- **Pace ratios** (is spend ahead of the calendar? watch triggers around 1.25×), **linear year-end projections**, and **flags** (overspend, high pace, revenue decline, stale data) ranked critical/warning/info.
- Lenses for **operating budget**, **procurement**, and **revenue** (year-over-year; warns if revenue is down >10%, critical >20%; stale-data flag if no entry in ~14 days in season).
- **Ask the advisor** (`financial-advisor`): questions are answered from the computed snapshot only. Rollout was phased: Phase 1 engine + view, Phase 2 advisory chat, Phase 3 daily warnings.

### Revenue (`/revenue`)
Log revenue by category (rounds, cart rentals, memberships, pro-shop sales…) with YTD totals and trend charts; feeds the Financial Watch revenue lens.

### Capital Projects (`/capital-projects`)
Track long-term capital work (irrigation upgrades, renovations, big equipment) with status, budget, and schedule.

---

## 13. Library & reference

Grouped under the **Library** hub (`/library`) for leadership/GM; crew/foreman/mechanic/pro get the Knowledge Base directly as their field reference.

### Knowledge Base (`/knowledge`, `/knowledge/new`, `/knowledge/view`)
Searchable SOPs, guides, and training articles tagged by category (mowing, irrigation, chemical, equipment, greens, safety, admin, seasonal…). Markdown bodies, file attachments, publish/unpublish, versioning, **per-user read tracking** (managers can see who reviewed what — useful for compliance training), and links to task templates.

### Onboarding & SOPs (`/onboarding`)
A GM library of ~24 editable training/SOP/onboarding documents stored in Supabase (seeded from `default-documents.ts`; "restore defaults" re-seeds). Documents are **role-aware** (all-staff, maintenance, F&B, pro-shop, rec-aide, manager). Select a new hire's role(s) and the app compiles a **combined-PDF new-hire packet** (`build-packet-pdf.ts`).

### Documents (`/documents`)
A searchable archive of **every document the app generates** — PRs, SOWs, Sole Source, DD-200/2212, SF-52, onboarding packets, work orders. Everything is stored in Supabase Storage and indexed (`created_documents`). Saving is best-effort — a failed archive never blocks your download. Multi-quote PRs keep every quote (`quote_paths`) so the ZIP includes them all.

### AI Library (`/ai-library`)
The management page for the reuse store described in §3b — browse past AI answers, see use counts, and prune.

---

## 14. Work Orders, Reports, and cross-cutting features

### Work Orders (`/work-orders`, `/work-orders/view`)
Formal work orders that **auto-create building-tagged clubhouse issues** (8400 = clubhouse, 3311 = maintenance) with two-way status sync; conversely, clubhouse issues can **escalate into work orders**.

### Reports (`/reports`, `/reports/monthly-board`)
**All PDFs are generated in the browser** (jsPDF + jspdf-autotable + pdf-lib, charts via the app's charting) — no server render. There are ~38 report modules: daily operations/assignments, weekly summary, equipment & service, parking, clubhouse, observations, AST inspections, irrigation/sprinkler, schedule handouts, Illinois RUP, asset inventory, resolution history, action plans (bilingual), pin sheets, financial watch, and the federal document renders (PR, SOW, Sole Source, SF-52, DD-200, DD-2212). The **Monthly Board Report** (`/reports/monthly-board`) is a two-page executive summary (labor, chemicals, equipment, weather, budget, tasks, observations) in brand colors. Export as PDF, CSV, ZIP, or print.

### Notifications & push (`/notifications`, `/settings/notifications`)
In-app notifications plus **web push (VAPID)** and **native Android push (FCM)**. Devices register via `push-subscribe`; `push-send` dispatches to web and native and prunes dead subscriptions. Poll interval and opt-in are configurable; the dashboard shows a push opt-in card.

### Bilingual / translation
Crew-facing text (task titles/descriptions, observations, action-plan reports) can be shown in **Spanish**. Translations run through the cache-first `translate` function so repeated strings are free after the first time.

### Report an Issue (`/report-issue`)
A quick channel (prominent for the Pro view) to flag problems to the maintenance team.

### Settings (`/settings`)
Profile, appearance, course settings, notifications, daily-briefing config, staff view, PINs, pin-sheet, and invites.

---

## 15. Offline, PWA & the Android app

- **Installable PWA** with a Serwist service worker; there's an `/install` helper page and an `/offline` fallback.
- **Offline-first writes:** reads cache in IndexedDB (short TTL); failed writes (insert/update/delete) queue in a **write queue** and **replay** automatically on reconnect/next launch. Responses are classified so 2xx clears the item, auth failures re-queue with a re-login prompt, server/5xx re-queue, and permanent 4xx surface a failure message.
- **Android (Capacitor):** package `com.vmgc.greenkeeper`, ships the static `out/` bundle inside the APK (works fully offline, no server URL). Native plugins: **barcode/QR scanning** (asset tracking), **camera**, **push (FCM)**, **filesystem** (save PDFs), **preferences** (PIN/view/tokens), and **share**. Build/signing details are in `APK_BUILD_GUIDE.md` and `MIGRATION-TO-CAPACITOR.md`.

---

## 16. Data backend & security

- **Supabase PostgreSQL** with **Row-Level Security** on tables and **~106 migrations** in `supabase/migrations/`. Storage buckets hold photos, documents, reports, and drone flights.
- Because sign-in is a **shared kiosk account**, all users effectively see all course data (there's no per-person row filtering); RLS still gates authenticated vs. anonymous access and hardens the tables.
- **Scheduled jobs** run via `pg_cron` (e.g., the daily briefing) using a shared secret rather than a user session.
- SQL is applied via the Supabase Management API using a CLI token stored in **Windows Credential Manager** (documented in the PR-audit/migration notes).

---

## 17. Running & maintaining the app

### Environment variables (key ones)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_WEATHER_API_KEY`, `ANTHROPIC_API_KEY`, `DAILY_BRIEFING_SECRET`, and the kiosk auth trio `NEXT_PUBLIC_APP_EMAIL` / `NEXT_PUBLIC_APP_PASSWORD` / `NEXT_PUBLIC_APP_PIN`. Edge-function secrets (Anthropic key, VAPID keys, FCM service account, weather key) are set with `supabase secrets set`.

### Common scripts
`npm run dev` (develop), `npm run build` (production build), `npm run typecheck`, `npm run lint`, `npm run test:run` (Vitest), `npm run test:e2e` (Playwright).

### When AI features break
This is almost always a **retired Claude model** returning 502s. Update the model constant in the affected `supabase/functions/*/index.ts` and run `supabase functions deploy` (token in Credential Manager; no Docker). Then confirm the function is listed in `EDGE_ROUTES` (`src/lib/api/client.ts`) so the client calls the edge function instead of a dead `/api` route.

### Deploying
The app is deployed by **Tyson only** — do not `git push` or deploy from tooling. New AI or schema features usually require a `supabase functions deploy` and/or applying a migration; each feature's notes call out whether a deploy/migration is needed.

---

## 18. Quick route index

| Area | Routes |
|---|---|
| Home | `/dashboard`, `/gm`, `/more` |
| Planning | `/my-day`, `/tasks`, `/schedule`, `/schedule/morning`, `/schedule/time-off`, `/calendar` |
| Course | `/grounds`, `/course-map` (+ green/hole/measure/resolution-history), `/irrigation` (+ map/schedule), `/parking-lot`, `/clubhouse`, `/weather`, `/photos` (+ timeline), `/voice-log`, `/standards-plan` |
| Agronomy | `/environmental`, `/ast-inspections` |
| Assets | `/assets` (+ scan/view/untracked), `/equipment/view`, `/equipment/service-history-view` |
| Staff | `/staff`, `/staff/profile`, `/staff/crews`, `/staff/sf52` |
| Pro shop | `/pro-shop-schedule` (+ duties), `/tournaments` |
| Procurement | `/procurement`, `/purchase-requests` (+ new/view), `/pr-audit` (+ new/view/budget/codes), `/order-list`, `/vendors` |
| Paperwork | `/paperwork`, `/sow`, `/sole-source`, `/dd-forms/200`, `/dd-forms/2212`, `/work-orders` |
| Finance | `/budget` (+ setup/overview/expenses), `/financial-watch`, `/revenue`, `/capital-projects` |
| Library | `/library`, `/knowledge` (+ new/view), `/onboarding`, `/documents`, `/ai-library` |
| AI & misc | `/assistant`, `/reports` (+ monthly-board), `/notifications`, `/report-issue`, `/settings`, `/install`, `/offline`, `/pin-login` |

---

*This guide reflects the app as of July 2026. The single source of truth for menus is `src/lib/layout/app-catalog.ts`; feature specifics live in `src/app/<route>/` and `src/lib/<feature>/`, and all server/AI logic lives in `supabase/functions/`.*
