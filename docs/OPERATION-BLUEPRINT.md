# GreenKeeper Pro — Operation Blueprint

*Built from Tyson's filled Operation Blueprint Worksheet (2026-07-02). This is the sign-off document for the restructure. Nothing here is built until Tyson approves; everything builds in stages on the SAME database, so no existing data is ever lost.*

---

## What the worksheet said (the requirements, in one place)

- One person runs everything today (Tyson); a superintendent and an F&B manager join the app later.
- The operation is **four businesses in one**: golf course, driving range, restaurant, pro shop — **with separate finances that must never be combined**. Golf simulators arrive this winter as a fifth revenue stream.
- Season: full ops late March → early October. Restaurant runs year-round.
- The #1 vision (his words, §16): every area has an **AI assistant that does the data entry** — upload a document and it files it, "schedule a tournament," "I hired someone" — ask once, answer a couple of verifying questions, done, **no bugs to chase**.
- The #2 complaint: the app is powerful but **setup is too much work** and it needs to be easier to navigate and train people on.
- Known pains: PR submitted amount ≠ actual spend; POS (RecTrac/GolfNow) can't integrate; retail/food inventory counted by hand; monthly obligations tracked in his head; work orders "tracked but not well."

---

## 1. The new shape: five workspaces + Today

The app reorganizes from ~20 menu entries into **five workspaces that match the real businesses**, plus a single home:

| Workspace | What lives there | Assistant can do |
|---|---|---|
| **Today** (home) | The day's plan from the operating rhythm (below), alarms coming due, quick capture | "What's due this week?" / "Push the tee mow to tomorrow" |
| **Course & Range** | Maintenance calendar, course map, irrigation, chemicals/spray, work orders, porta potties (2), range | "Log today's spray on 4–9 fairways" / photo → course issue |
| **Restaurant** | Hot Dog Monday + weekly food ops, US Foods ordering, cleaning logs, fire-extinguisher sign-off, hand-count inventory, revenue uploads | "Upload this invoice" / "Add fryer cleaning to Fridays" |
| **Pro Shop** | Merch inventory (hand count), staff schedule (exists), tee-time notes, revenue uploads | "We got 24 new polos at $22 cost" |
| **Money** | Per-area P&L (separate, never combined), PRs + reconciliation, budgets, fuel spend, FY Oct–Sep rollups, Financial Watch | "How much did maintenance spend in June?" |
| **People & Paperwork** | 3 employees + hires, certs w/ expiry alarms, onboarding, all federal form fillers (unchanged — they work) | "I hired John Smith, here's his food-handler card" |

The existing pages don't get thrown away — they get re-homed under these six doors, and each workspace gets a landing page that shows status at a glance (what's due, what's low, what's unsigned).

## 2. The operating rhythm (Tyson asked for this to be designed)

Seeded as editable recurring duties + calendar entries. In-season weekly template, sized for a 3-person crew + Tyson:

| Day | Course & Range | Restaurant / Pro Shop |
|---|---|---|
| **Mon** | Mow greens; change cups; range setup | **Hot Dog Monday**; place US Foods order (arrives midweek) |
| **Tue** | Mow tees + collars; bunkers; setup for Wed league | Receive/stock delivery |
| **Wed** | Mow fairways (AM, before play); **Wednesday league** | League food/beverage support |
| **Thu** | Mow greens; course setup; **Thursday commanders league** | League support |
| **Fri** | Mow rough (rotating sections); weekend setup; range pick | Fryer/equipment cleaning log |
| **Sat/Sun** | Cups + greens touch-up only (minimal crew) | Normal service |

Spray days ride on the existing spray-window/GDD tools, not a fixed weekday. Annual anchors (cool-season turf, northern Illinois): greens aeration ~May and ~September, overseed late August–September, irrigation winterization late October, simulator setup November.

**Monthly anchors (the alarm list — derived from the worksheet since the "never-miss" table was left blank; Tyson to confirm):**

| When | Obligation | Notes |
|---|---|---|
| 1st | AST tank inspections | already in app |
| 1st | Fire-extinguisher signatures | **delegable** — assignable duty |
| 1st–5th | Prior-month revenue rollup by category, per area | feeds per-area P&L |
| 1st–5th | Prior-month PR spend + fuel purchase totals | auto-computed once data is in |
| Last week | Restaurant inventory hand-count | count-sheet mode |
| Last week | Pro shop inventory hand-count | count-sheet mode |
| Per FY schedule | Asset inventory submissions (maint / F&B / pro shop) | dates needed from Tyson |
| Oct 1 | Section 889 vendor cert renewals | already tracked |
| Oct | FY rollover (budgets, PR numbering) | already FY-aware |

## 3. The per-area AI assistant (the centerpiece)

Extends the existing `ai-assistant` edge function (tool-use loop, already talks to real data through RLS) with:

1. **Workspace scoping** — the assistant knows which workspace it's on and gets that area's tools.
2. **Intake tools** — create employee + cert records, schedule events/tournaments with prep checklists, add inventory items/counts, log fuel refills, file uploaded documents into the right place.
3. **The "verify then commit" pattern** — the assistant always shows what it's about to write ("New hire: John Smith, rec aid, food-handler cert expires 3/2027 — save?") and commits only on confirmation. This is the "ask once, verify, no mistakes" behavior from the worksheet, and it's also the honest way to keep AI from writing bad data.
4. **Document drop** — every workspace accepts a photo/PDF; Claude vision classifies it (invoice, cert, inspection, receipt, POS report) and routes it to the right intake tool. The vision extractors already exist for PRs/quotes/889s/staff docs — this generalizes the pattern.

## 4. Money upgrades

- **PR reconciliation:** each PR gets an `actual_amount` + receipt upload at the "received" stage; a monthly variance view shows submitted vs actual. (Solves "I don't know what the order actually cost until the receipt comes back.")
- **Revenue ingestion without POS integration:** upload RecTrac/GolfNow end-of-period reports or screenshots → vision extraction into revenue categories per area → deterministic totals (AI only transcribes, never invents — house rule).
- **Per-area P&L:** Financial Watch gains an area lens (course / range / restaurant / pro shop / simulators-later) so "we are not profitable" becomes "THIS area is off by THIS much."
- **Fuel:** refill log per tank (date, gallons, receipt photo, sent-to-business-office flag) rolling into monthly totals. One-time task seeded: **call Reladyne about the auto-gauge refill program**.

## 5. Inventory

- Assets stay barcode-driven (working today).
- **Hand-count mode** for restaurant + pro shop: monthly count sheets (printable or tap-to-count), par levels, low-stock flags into the order list, variance vs last count.
- DPAS/property import waits for the export from the government computer (manual export only — never automated against .mil systems).

## 6. Build order (each phase ships working + tested before the next)

1. **Workspaces + Today + alarms** — the IA restructure, rhythm seeded, monthly anchors alarming. Biggest visible change, no risky data work.
2. **Money** — PR reconciliation, revenue upload/extraction, per-area P&L, fuel log.
3. **Area assistants** — scoped AI intake with verify-then-commit.
4. **Restaurant & Pro Shop modules** — cleaning logs, extinguisher duty, hand-count inventory.
5. **People & certs + DPAS import** — cert expiry alarms; importer when the export arrives.

## Open questions for Tyson (answer in chat, no new worksheet)

1. Confirm/correct the monthly anchor table above — especially the asset-submission dates.
2. Who gets the fire-extinguisher duty when staff join the app?
3. A sample POS report (photo or export) from RecTrac/GolfNow — needed to build the revenue extractor against the real format.
4. Which day does US Foods deliver? (Sets the order day in the rhythm.)
5. The weekly mow cadence above is a starting proposal — adjust to how the crew actually runs.
