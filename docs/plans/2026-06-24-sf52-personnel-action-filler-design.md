# SF-52 Personnel Action Filler — Design

_Date: 2026-06-24_

## Problem

The superintendent files SF-52 (OPM "Request for Personnel Action") forms for
new hires/recruitments, resignations, and other personnel actions (pay
increase, LWOP, award, temp promote, transfer, return to duty, change cost
center). Today this is manual. We want to:

1. Store each employee's employment details once.
2. Pick an employee + action and have the SF-52 auto-fill from those details.
3. Print/download a result **indistinguishable from the official OPM form**.

## Source form analysis

`SF52_Blank_Dec2022.pdf` is a 2-page **fillable AcroForm** (LiveCycle/XFA
origin). pdf.js reads its widget fields (text `Tx`, button `Btn`, signature
`Sig`) with names and exact rects; `pdf-lib` cannot parse the raw file
(broken xref / Pages ref). Page size ~612×792 pt (letter).

Per the official SF-52 Desk Guide (Rev Mar 2026), the **requesting office**
fills only a slice:

- **Part A:** box 1 Actions Requested, box 3 "for additional info call"
  (preparer), box 4 Proposed Effective Date. Box 2 = do not fill. Boxes 5/6 =
  approval blocks (left blank — see decisions).
- **Part B identity/position:** box 1 Name (Last, First, Middle); boxes 7–14
  (FROM position) and/or 15–22 (TO position); box 32 Work Schedule
  (RFT/RPT/FLEX); box 33 part-time/flex avg hours; box 35 FLSA (E/N); box 36
  Appropriation Code (5-digit home cost center); box 38 Duty Station Code
  (`00128`); box 39 Duty Station (`Great Lakes, IL 60088`).
  - Boxes 2 (SSN), 3 (DOB), 4–6 (effective date + nature-of-action/legal
    authority codes), 23–31, 34, 37, 40–51 = **left blank** (HR/N92 completes).
  - Pay sub-boxes 12A–12D / 20A–20D = leave blank. Step (11/19) only for
    crafts/trades (NA/NL). Pay basis (13/21) = "hourly".
  - Org box 14/22 = NAVSTA Great Lakes · MWR Dept · facility+bldg · program.
- **Part D** (recruitments only): # recruitments, area of consideration,
  proposed hourly salary range, relocation authorized, other notes.
- **Part E** (resignations only): reason (date of notice + how given),
  effective date, employee signature (blank), date signed, forwarding address.
- **Part F:** remarks for any other action.

## Decisions (confirmed with user)

- **Action scope:** full tailored menu — Recruitment, Resignation, Pay
  Increase, Temp Promote, Termination of Temp Promote, Transfer, LWOP, Return
  to Duty, On-the-Spot Award, Change Cost Center (extensible).
- **Signatures/approvals:** approval + signature blocks (Part A 5/6, Part E
  signature) are left **blank** for hand/e-signature. Only factual data boxes
  are filled.
- **No sensitive PII** (SSN/DOB) is stored or printed.
- **Indistinguishable output**, verified by rendering each generated form to an
  image and comparing to the blank.

## Architecture

### 1. Employee data (extend existing `profiles` / `/staff`)

Add a nullable JSONB `personnel_details` to `profiles` (mirrors the existing
`emergency_contact` JSONB pattern; one small migration). Shape:

```
{
  name_last, name_first, name_middle,   // SF-52 "Name (Last, First, Middle)"
  position_title, position_number,
  pay_plan,        // "NF" | "NA" | "NL"
  occ_series,      // 4-digit, e.g. "0189"
  pay_band,        // 2-digit, e.g. "02"
  step,            // crafts/trades only
  hourly_rate,     // number
  work_schedule,   // "RFT" | "RPT" | "FLEX"
  avg_hours,       // for flex/part-time
  flsa,            // "E" | "N"
  cost_center      // 5-digit
}
```

Edited on the `/staff/profile` **Info** tab (new "Personnel / SF-52 details"
section). `name_*` default-parse from `full_name`.

### 2. Facility constants (`src/lib/sf52/constants.ts`)

Org block (NAVSTA Great Lakes / MWR Dept / Veterans Memorial Golf Course, BLDG
8400 / Golf Course), Duty Station Code `00128`, Duty Station `Great Lakes, IL
60088`. Preparer (box 3) = current user's name + phone.

### 3. Action config (`src/lib/sf52/actions.ts`)

One entry per action mapping to: box-1 label template (e.g. `Recruitment, vice
{vice}`), `fillFrom` / `fillTo` booleans, extra section (`D` | `E` | `F` |
none), effective-date hint, and the action-specific input fields. FROM
auto-fills from the employee; TO starts as an editable copy of FROM (the "new"
values).

### 4. PDF generator (`src/lib/reports/sf52-report.ts`)

- **Template:** one-time preprocess of the official PDF into a clean,
  `pdf-lib`-loadable copy at `public/templates/sf52-template.pdf` (vector text
  preserved). Fallback if needed: high-DPI raster of the official form as the
  page background. Either is print-identical.
- **Field map** (`src/lib/sf52/sf52-fields.ts`): box id → page + rect (pt),
  extracted via pdf.js. Generator draws each value at its rect with Helvetica
  sized to fit; long Part D/E/F text auto-shrinks/wraps (reuse sole-source
  autofit). Checkboxes (e.g. Part D Yes/No) stamped via an X/▪.
- **Output:** `{ blob, filename }`, filename
  `SF52_<Action>_<LastName>_<PositionTitle>_<MonthYear>.pdf`.
- **Verification:** render every page to PNG (pdf.js harness used for the SOW)
  and eyeball vs. the blank. Note: `sharp` cannot rasterize PDFs in this env;
  use Playwright + pdf.js from CDN (see `sow-persistence` memory).

### 5. Create flow (UI)

New "Personnel Actions (SF-52)" area under `/staff`:
1. Pick action → 2. pick employee (recruitment: pick the departing/"vice"
person or a vacant position; Name left blank) → 3. action-specific form
(effective date, TO edits, Part D/E/F fields; box-1 text auto + editable) →
4. **Preview → Download/Print**, saving a copy to `/documents` (type `sf52`).

### 6. Persistence

`saveCreatedDocument({ doc_type: 'sf52', title, meta: { employee_id, action } })`
after generation (best-effort, same pattern as SOW/sole-source).

## Edge cases

- Missing employee fields → leave blank, show a small "these boxes are empty"
  notice; never block generation.
- Recruitment with no current employee → Name blank, TO from chosen position.
- Crafts/trades (NA/NL) → include Step; NF payband → Step blank.
- Pay basis always "hourly".

## Testing

- Regression test: fill a sample SF-52, assert valid 2-page PDF and that key
  values land in the expected field rects.
- Visual render check during development.

## Implementation phases

1. **Keystone:** template prep + field map + `sf52-report.ts`; fill a sample
   and verify indistinguishable output. (De-risks everything.)
2. `personnel_details` migration + `/staff/profile` Info-tab section.
3. Action config + facility constants.
4. Create-SF-52 UI under `/staff`.
5. Persistence to `/documents` + filename convention.
6. Tests + final visual verification.
