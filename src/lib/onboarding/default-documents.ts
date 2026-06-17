/**
 * Default onboarding / SOP library content for Veterans Memorial Golf Course.
 *
 * This is the authored "factory" content. It seeds the `onboarding_documents`
 * table on first load and backs the "Restore defaults" action. Once seeded,
 * the GM edits the live copy in the app — edits live in the database, not here.
 *
 * Bodies are Markdown (headings, bullets, `- [ ]` checkboxes, **bold**, `---`).
 */

export type OnboardingRole =
  | "all"
  | "maintenance"
  | "fnb"
  | "pro-shop"
  | "rec-aide"
  | "manager";

export type OnboardingCategory =
  | "training"
  | "sop"
  | "opening-closing"
  | "cart"
  | "worksheet"
  | "info"
  | "policy";

export interface OnboardingDocSeed {
  slug: string;
  title: string;
  category: OnboardingCategory;
  roles: OnboardingRole[];
  sort_order: number;
  body: string;
}

export const ROLE_LABELS: Record<OnboardingRole, string> = {
  all: "All staff",
  maintenance: "Maintenance",
  fnb: "Food & Beverage",
  "pro-shop": "Pro Shop",
  "rec-aide": "Rec Aide",
  manager: "Manager / GM",
};

export const ROLE_ORDER: OnboardingRole[] = [
  "all",
  "maintenance",
  "fnb",
  "pro-shop",
  "rec-aide",
  "manager",
];

export const CATEGORY_LABELS: Record<OnboardingCategory, string> = {
  training: "Training Guide",
  sop: "SOP",
  "opening-closing": "Opening / Closing",
  cart: "Cart Cleaning",
  worksheet: "Worksheet",
  info: "Employee Info",
  policy: "Policy",
};

export const CATEGORY_ORDER: OnboardingCategory[] = [
  "info",
  "training",
  "policy",
  "opening-closing",
  "sop",
  "cart",
  "worksheet",
];

export const DEFAULT_DOCUMENTS: OnboardingDocSeed[] = [
  // ───────────────────────── All staff ─────────────────────────
  {
    slug: "employee-information-sheet",
    title: "Employee Information Sheet",
    category: "info",
    roles: ["all"],
    sort_order: 1,
    body: `# Employee Information Sheet
Veterans Memorial Golf Course. Please complete and return to the office on your first day.

## Personal
- Full legal name: ______________________________
- Preferred name: ______________________________
- Mailing address: ______________________________
- City / State / ZIP: ______________________________
- Personal phone: ______________________________
- Personal email: ______________________________
- Date of birth: ______ / ______ / __________

## Position
- Position / title: ______________________________
- Department (circle one): Maintenance  /  Food & Beverage  /  Pro Shop  /  Rec Aide
- Start date: ______ / ______ / __________
- Direct supervisor: ______________________________
- Employment type (circle one): Full-time  /  Part-time  /  Seasonal
- Uniform / shirt size: ______

## Emergency Contact
- Name: ______________________________
- Relationship: ______________________________
- Phone: ______________________________
- Second contact / phone: ______________________________
- Allergies or medical notes we should know: ______________________________

## Office Use Only
- [ ] I-9 verified
- [ ] W-4 on file
- [ ] Direct deposit form received
- [ ] Background check complete (if required)
- [ ] Added to schedule and timekeeping

## Acknowledgement
I certify the information above is accurate and will report any changes to the office.

Employee signature: ________________________________   Date: ______________`,
  },
  {
    slug: "new-hire-onboarding-checklist",
    title: "New-Hire Onboarding Checklist",
    category: "training",
    roles: ["all"],
    sort_order: 2,
    body: `# New-Hire Onboarding Checklist
Complete during the first one to two shifts. The supervisor initials each item.

## Day 1 — Paperwork & Access
- [ ] Employee Information Sheet completed and turned in
- [ ] I-9 and W-4 submitted to the office
- [ ] Direct deposit set up
- [ ] Pay schedule and timekeeping explained (how to clock in and out)
- [ ] Uniform and name tag issued
- [ ] Facility tour: clubhouse, restrooms, break area, staff parking, time clock
- [ ] Emergency exits, first-aid kit, and AED locations shown

## Day 1 — Policies
- [ ] Read Workplace Conduct & Expectations
- [ ] Read Safety & Emergency Procedures
- [ ] Availability, scheduling, and call-off procedure explained

## First Week — Role Training
- [ ] Completed the department Training Guide
- [ ] Shadowed an experienced employee for a full shift
- [ ] Walked through opening and/or closing procedures with supervisor
- [ ] Reviewed the SOPs that apply to the position
- [ ] Knows where to find SOPs and who to ask when unsure

## 30 Days
- [ ] 1:1 check-in completed with supervisor
- [ ] Performs core duties confidently and independently

Supervisor: ____________________   Employee: ____________________   Date: ____________`,
  },
  {
    slug: "workplace-conduct-expectations",
    title: "Workplace Conduct & Expectations",
    category: "policy",
    roles: ["all"],
    sort_order: 3,
    body: `# Workplace Conduct & Expectations
Veterans Memorial Golf Course is a small team. Members, guests, and military families judge the course by every interaction. These expectations apply to all staff.

## Attendance & Reliability
- Arrive ready to work at your scheduled start time. "On time" means clocked in and at your station.
- If you cannot make a shift, call your supervisor as early as possible — never text a coworker and assume it is covered.
- Find your name on the posted schedule each week and confirm your shifts.

## Appearance
- Wear the issued uniform, clean and in good repair, with your name tag.
- Closed-toe shoes at all times. Maintenance: work boots. No torn or stained clothing.
- Good personal hygiene; keep it professional.

## Guest Service
- Greet every guest. Make eye contact and be friendly — a simple "Good morning, welcome to VMGC" goes a long way.
- If you do not know an answer, say "Let me find out for you" and ask a coworker or supervisor.
- Never argue with a guest. Stay calm and bring concerns to a supervisor.

## Phones & Breaks
- Personal phones stay put away during your shift except on breaks or for a work purpose.
- Take breaks at the times approved by your supervisor and clock out/in as instructed.

## Respect & Safety
- We do not tolerate harassment, discrimination, bullying, or threats of any kind.
- Report unsafe conditions, injuries, and conflicts to a supervisor right away.
- Reporting to work under the influence of alcohol or drugs is grounds for termination.

## Property & Confidentiality
- Treat course equipment, carts, and supplies with care; report damage immediately.
- Do not share guest information, member lists, or course business outside of work.

I have read and understand these expectations.

Employee signature: ________________________________   Date: ______________`,
  },
  {
    slug: "safety-emergency-procedures",
    title: "Safety & Emergency Procedures",
    category: "policy",
    roles: ["all"],
    sort_order: 4,
    body: `# Safety & Emergency Procedures
Know these before your first shift. When in doubt, protect people first, then property.

## Emergency Numbers
- Emergency (fire / police / medical): 911
- Course manager / supervisor on duty: ______________________
- Clubhouse phone: ______________________
- Address for 911: Veterans Memorial Golf Course, Naval Station Great Lakes, IL

## Medical Emergency / Injury
1. Call 911 for anything serious (chest pain, heavy bleeding, head injury, unresponsive person).
2. Do not move a seriously injured person unless they are in further danger.
3. Send someone to meet responders and guide them in.
4. First-aid kits are located: ______________________. AED is located: ______________________.
5. Report every injury — staff or guest — to a supervisor and complete an incident report the same day.

## Lightning & Severe Weather
- When the horn sounds or lightning is within range, clear the course immediately and direct guests to shelter.
- Shelter locations: clubhouse interior / designated shelters. Open-sided structures and trees are NOT safe.
- Resume play only when management gives the all-clear (typically 30 minutes after the last strike).

## Fire
- Pull the alarm, call 911, and evacuate. Use an extinguisher only on a small fire if it is safe.
- Meet at the designated assembly point: ______________________.

## Chemical / Fuel Spill
- Keep people away. Do not hose spills into drains.
- Notify the maintenance lead; refer to the product SDS (Safety Data Sheet) binder in the shop.

## General
- Report broken equipment, trip hazards, and wet floors right away — tag or block the area.
- Lift with your legs; get help for heavy items.
- Stay hydrated and use sun protection on hot days.

I have read and understand these procedures.

Employee signature: ________________________________   Date: ______________`,
  },
  {
    slug: "one-on-one-checkin-worksheet",
    title: "1:1 Check-In Worksheet",
    category: "worksheet",
    roles: ["all"],
    sort_order: 5,
    body: `# 1:1 Check-In Worksheet
A short, regular conversation between an employee and their supervisor. Use it at 30 days, then monthly or quarterly. Fill it out together.

**Employee:** ____________________   **Supervisor:** ____________________   **Date:** ____________

## Since last time
- What went well? What are you proud of?
  - ______________________________________________________________
- What was frustrating or got in the way?
  - ______________________________________________________________

## Today
- How are things going overall (1–5)? ______   Why?
  - ______________________________________________________________
- Anything you need from me (tools, training, schedule, clarity)?
  - ______________________________________________________________

## Feedback — both directions
- One thing the employee is doing well:
  - ______________________________________________________________
- One thing to work on or do differently:
  - ______________________________________________________________
- Feedback for the supervisor / course:
  - ______________________________________________________________

## Goals & Action Items
| Action | Owner | By when |
| --- | --- | --- |
| ____________________ | ________ | ________ |
| ____________________ | ________ | ________ |

**Next check-in date:** ______________`,
  },
  {
    slug: "cart-cleaning-procedure",
    title: "Cart Cleaning Procedure",
    category: "cart",
    roles: ["pro-shop", "rec-aide", "fnb"],
    sort_order: 6,
    body: `# Cart Cleaning Procedure
Clean carts keep guests happy and protect the fleet. Clean every cart after each round and again at end of day.

## After Each Round (quick turn)
1. Pull the cart to the staging / wash area.
2. Remove trash, scorecards, tees, and leftover cups or cans.
3. Wipe down the seat, dash, steering wheel, and cup holders with a damp cloth.
4. Knock grass and sand off the floor mat and bag straps; rinse if needed.
5. Check that the cart is charged or fueled and the windshield is clean.
6. Stage it facing out, ready for the next group.

## End of Day (full clean)
1. Empty all trash and remove any forgotten personal items (log valuables and turn them in to the pro shop).
2. Rinse the cart, then wash seats, body, roof, wheels, and floor.
3. Clean the windshield inside and out; dry to avoid streaks.
4. Wipe the dash, steering wheel, and cup holders; sanitize touch points.
5. Electric carts: plug in to charge. Gas carts: check fuel and top off as directed.
6. Note any damage, warning lights, low tires, or pull-to-one-side on the cart status sheet and tell a supervisor.

## Beverage Cart (Food & Beverage)
- At end of shift, remove all product and ice, drain and wipe the cooler wells, and sanitize all surfaces.
- Reconcile inventory and cash with the pro shop before clocking out.
- Plug in to charge and report any mechanical issues.

## Reminders
- Use only approved cleaners; never spray electronics directly — spray the cloth.
- Report a cart that is not safe to drive and tag it "OUT OF SERVICE."`,
  },

  // ───────────────────────── Maintenance ─────────────────────────
  {
    slug: "maintenance-training-guide",
    title: "Maintenance Training Guide",
    category: "training",
    roles: ["maintenance"],
    sort_order: 10,
    body: `# Maintenance Training Guide
Welcome to the grounds crew. Our job is to present a safe, healthy, great-looking course every day — usually before the first group tees off. We are a small crew, so everyone pitches in.

## The Daily Rhythm
- Most of the day is mowing and course setup. A normal day is greens, tees, fairways, and changing cups/markers — extras get added as time allows.
- Get the playing surfaces done and the course set before golfers reach them.
- Communicate with the superintendent on what's priority that day.

## What You'll Learn (first 2–4 weeks)
1. Shop layout, where tools and parts live, and how to check out equipment.
2. Safe operation of each machine you'll run (see Equipment & Mowing Safety SOP). Do not operate anything until trained and cleared on it.
3. Mowing patterns and heights of cut for greens, tees, and fairways.
4. Changing holes/cups, moving tee markers, raking bunkers, filling divots and ball marks.
5. Hand-watering, syringing greens, and basic irrigation checks.
6. Course etiquette around golfers: yield to play, keep noise down, never mow through a group.

## Standards
- Clean, fuel, and put away every machine after use; report problems immediately.
- Stripes straight, edges clean, no scalping. If it doesn't look right, fix it or flag it.
- Pick up trash and broken tees as you go.

## Communication
- Start each day with the morning plan. Radios/phones on and answered.
- "Done early" means ask what's next, not park the cart.

## First-Week Checklist
- [ ] Shop tour and safety walk-through
- [ ] Cleared on the first machine (push/walk mower or utility vehicle)
- [ ] Changed cups and moved markers with a crew member
- [ ] Reviewed the chemical/PPE SOP (even if not yet applying)
- [ ] Knows the morning opening routine`,
  },
  {
    slug: "maintenance-opening-procedures",
    title: "Maintenance — Morning / Opening Procedures",
    category: "opening-closing",
    roles: ["maintenance"],
    sort_order: 11,
    body: `# Maintenance — Morning / Opening Procedures
Goal: course set and surfaces cut before play reaches them.

## Arrival
1. Clock in. Check the day's plan / board for assignments and weather.
2. Quick weather check — frost, rain, lightning, wind. No mowing greens on frost until released.
3. Grab radio/phone, keys, and your PPE.

## Equipment Check (before driving off)
1. Walk around your machine: fuel/charge, oil, tires, reels/blades, hydraulic leaks.
2. Set height of cut as assigned; confirm baskets/catchers are on.
3. Log hours if required. Do not take a machine that isn't safe — tag it and tell the lead.

## Course Setup (typical order)
1. Greens first (mow or roll as assigned), then change cups and place flags.
2. Move tee markers to the day's tees; fill divots; empty tee trash and refill sand bottles.
3. Tees and approaches, then fairways as time allows.
4. Rake bunkers; check and fill ball-mark/divot areas on greens and tees.
5. Check water stations, restrooms on course, and trash near the clubhouse.

## Before Golfers
- Stay ahead of the first group; if you can't, yield and circle back.
- Confirm flags are in, cups are clean, and markers are set on every hole you finish.

## Hand Off
- Report anything that needs attention (wet spots, broken heads, damage) to the superintendent.`,
  },
  {
    slug: "maintenance-closing-procedures",
    title: "Maintenance — End-of-Day / Closing Procedures",
    category: "opening-closing",
    roles: ["maintenance"],
    sort_order: 12,
    body: `# Maintenance — End-of-Day / Closing Procedures
Leave the shop ready for tomorrow.

## Equipment
1. Blow off and wash down each machine; clear clippings from reels/decks.
2. Refuel gas units; plug in electric units to charge.
3. Check fluids and tires; note anything that needs service on the equipment log.
4. Lower/secure attachments; park in assigned spots.
5. Wipe up oil/fuel drips; keep the wash pad clear.

## Shop
1. Return hand tools to their place; put away parts and supplies.
2. Empty shop trash; sweep work areas.
3. Restock sand bottles, cups, and flags for the morning.
4. Secure the chemical room and confirm nothing is left open or spilled.

## Course
1. Confirm irrigation program is set/running as planned for the night.
2. Pick up any equipment left on the course.

## Close Out
1. Tell the superintendent about any unfinished tasks or problems.
2. Lock shop doors and gates; turn off lights and shop equipment.
3. Clock out.`,
  },
  {
    slug: "equipment-mowing-safety-sop",
    title: "Equipment & Mowing Safety SOP",
    category: "sop",
    roles: ["maintenance"],
    sort_order: 13,
    body: `# Equipment & Mowing Safety SOP
**Purpose:** prevent injuries and equipment damage during mowing and equipment use.

## Before You Operate
- Be trained and cleared on a specific machine before using it. If unsure, ask.
- Wear PPE: closed boots, eye protection, hearing protection on loud units, long pants. No loose clothing or jewelry.
- Do a walk-around: fuel/charge, oil, hydraulic leaks, tire condition, blades/reels, guards in place.

## Operating
- Keep all guards and shields installed. Never bypass a safety switch or seat sensor.
- Mow across slopes with riding units where possible; use walk units on steep banks.
- Watch for golfers, pedestrians, and pets. Yield to play. Never mow toward or through a group.
- Slow down on wet grass, near bunkers, ponds, and cart paths. No riders.
- Keep hands and feet away from reels, blades, and belts at all times.

## Refueling & Battery
- Engine off and cool before refueling. No smoking. Clean up spills.
- Charge electric units in a ventilated area; don't leave damaged batteries/chargers in use.

## Clearing a Jam / Service
- Engine off, key out, blades stopped, parked, and brake set before reaching into any machine.
- Lower or block raised decks/attachments before working underneath.

## After Use
- Clean the machine, report any defect, and tag "OUT OF SERVICE" anything unsafe — do not let the next person find out the hard way.

## If Something Goes Wrong
- Stop, secure the machine, and get help. Report all incidents and near-misses to the superintendent.`,
  },
  {
    slug: "chemical-handling-ppe-sop",
    title: "Chemical Handling & PPE SOP",
    category: "sop",
    roles: ["maintenance"],
    sort_order: 14,
    body: `# Chemical Handling & PPE SOP
**Purpose:** safe, legal handling of fertilizers and pesticides. Illinois restricted-use products may only be applied by or under a licensed applicator.

## Rules
- Only trained, authorized staff handle or apply chemicals. Never apply a restricted-use pesticide without a licensed applicator directing the work.
- Read the product label and SDS before handling. The label is the law — follow rate, PPE, and re-entry interval (REI).

## PPE (minimum — follow the label if it requires more)
- Chemical-resistant gloves, eye protection, long sleeves and pants, closed shoes.
- Respirator only if the label requires it and you are fit-tested/trained.

## Mixing & Application
- Mix in the designated area with secondary containment; never near wells, drains, or open water.
- Triple-rinse containers; add rinse water to the tank.
- Calibrate sprayers/spreaders; apply only the labeled rate. Do not apply before heavy rain or in high wind.
- Post or communicate treated areas and observe the REI before anyone re-enters.

## Storage
- Keep products in the locked chemical room, in original labeled containers, separated as the label requires.
- Keep the SDS binder current and accessible.

## Records (Illinois)
- Record every application: date, product, EPA reg #, rate, area, target, applicator, and weather. File records as required.

## Spills & Exposure
- Contain small spills with the spill kit; keep people away; never wash into drains.
- Skin/eye contact: follow first-aid on the label, flush as directed, and seek care. Tell a supervisor immediately.`,
  },

  // ───────────────────────── Food & Beverage ─────────────────────────
  {
    slug: "fnb-training-guide",
    title: "Food & Beverage Training Guide",
    category: "training",
    roles: ["fnb"],
    sort_order: 20,
    body: `# Food & Beverage Training Guide
Welcome to F&B. You're often the face guests remember — fast, friendly, and clean service is the goal.

## Your Role
- Greet and serve guests at the grill/snack bar and on the beverage cart.
- Prepare simple food and drink orders accurately and quickly.
- Keep everything clean and stocked, and handle cash/card payments correctly.

## What You'll Learn
1. Menu items, prices, and how to ring them up on the POS.
2. Food safety basics: handwashing, temperatures, avoiding cross-contamination (see Food Safety & Sanitation SOP).
3. Opening and closing the grill/snack bar.
4. Beverage cart operation, stocking, and cart cleaning.
5. Responsible alcohol service: check IDs, recognize intoxication, know when to say no.

## Service Standards
- Wash hands often and wear gloves when handling ready-to-eat food.
- Greet within a few seconds; repeat orders back; thank every guest.
- Keep counters, tables, and equipment wiped and stocked throughout the shift.

## Alcohol Service
- Check ID for anyone who appears under 30. Acceptable: valid government photo ID.
- Do not serve anyone visibly intoxicated or underage. When unsure, get a supervisor.

## First-Week Checklist
- [ ] Learned the menu and POS basics
- [ ] Completed food-safety walk-through
- [ ] Ran an opening and a closing with a supervisor
- [ ] Trained on the beverage cart and cart cleaning
- [ ] Reviewed alcohol service rules`,
  },
  {
    slug: "fnb-opening-procedures",
    title: "Food & Beverage — Opening Procedures",
    category: "opening-closing",
    roles: ["fnb"],
    sort_order: 21,
    body: `# Food & Beverage — Opening Procedures

## Start of Shift
1. Clock in, wash hands, put on a clean apron.
2. Unlock and turn on lights; check for any overnight issues (leaks, pests, equipment off).

## Kitchen / Grill
1. Turn on and preheat equipment (grill, fryer, warmers); record temperatures.
2. Check cooler/freezer temps (cooler ≤ 41°F, freezer ≤ 0°F) and log them. Report anything out of range.
3. Stock and date product; rotate first-in, first-out. Discard anything past date.
4. Set up handwashing and sanitizer stations; mix sanitizer to the correct strength.

## Front / Service Area
1. Wipe and sanitize counters and tables.
2. Stock cups, lids, napkins, condiments, and to-go supplies.
3. Stock and ice the cold drinks; brew coffee if served.

## Cash / POS
1. Count the opening cash drawer and confirm the starting amount; note it on the log.
2. Power up the POS and confirm card reader works.

## Beverage Cart
1. Stock product, ice, cups, and a starting bank; confirm the cart is charged.
2. Record starting inventory before heading out.

## Ready
- Counters clean, food at temp, drawer counted, area stocked. Open on time.`,
  },
  {
    slug: "fnb-closing-procedures",
    title: "Food & Beverage — Closing Procedures",
    category: "opening-closing",
    roles: ["fnb"],
    sort_order: 22,
    body: `# Food & Beverage — Closing Procedures

## Food & Equipment
1. Turn off and cool grill, fryer, and warmers per manufacturer steps; filter/clean the fryer as scheduled.
2. Store, date, and rotate leftover product; discard anything unsafe or out of date.
3. Record closing cooler/freezer temps.

## Clean & Sanitize
1. Wash, rinse, and sanitize all dishes, utensils, and prep surfaces.
2. Wipe and sanitize counters, tables, equipment exteriors, and handles.
3. Clean the grill/fryer area and floors; take out trash and replace liners.
4. Refill and reset handwash and sanitizer stations for the morning.

## Beverage Cart
1. Remove product and ice; drain and wipe cooler wells; sanitize surfaces.
2. Reconcile cart inventory and cash; plug in to charge (see Cart Cleaning Procedure).

## Cash / POS
1. Count the drawer, run the end-of-day report, and reconcile cash + cards to sales.
2. Record over/short; secure cash drop per course procedure.
3. Power down the POS.

## Lock Up
1. Confirm equipment is off, coolers closed, water off where applicable.
2. Turn off lights, lock doors. Clock out.`,
  },
  {
    slug: "food-safety-sanitation-sop",
    title: "Food Safety & Sanitation SOP",
    category: "sop",
    roles: ["fnb"],
    sort_order: 23,
    body: `# Food Safety & Sanitation SOP
**Purpose:** serve safe food and pass every health inspection.

## Personal Hygiene
- Wash hands for 20 seconds: on arrival, after restroom, after touching face/phone/trash, between raw and ready-to-eat foods, and after any break.
- Wear gloves for ready-to-eat foods; change them when they tear or get contaminated.
- Do not work with food if you have vomiting, diarrhea, fever, or an open uncovered wound — tell a supervisor.

## Temperatures
- Cold holding ≤ 41°F. Hot holding ≥ 135°F. Freezer ≤ 0°F.
- Cook to safe internal temps: poultry 165°F, ground meat 155°F, other meats 145°F. Use a clean thermometer.
- Cool leftovers quickly (135°F to 41°F within the required time). Label and date everything.

## Avoid Cross-Contamination
- Separate raw meats from ready-to-eat foods; use separate boards/utensils or clean and sanitize between.
- Store raw meats below and away from produce and prepared foods.

## Cleaning & Sanitizing
- Wash → rinse → sanitize → air dry. Mix sanitizer to the correct concentration and test it.
- Keep wiping cloths in sanitizer buckets between uses.

## FIFO & Storage
- First in, first out. Label and date product. Discard expired or questionable items — when in doubt, throw it out.

## Pests & Reporting
- Keep doors closed and food covered. Report any sign of pests immediately.
- Report equipment that can't hold temperature right away.`,
  },
  {
    slug: "fnb-cash-pos-sop",
    title: "F&B Cash Handling & POS SOP",
    category: "sop",
    roles: ["fnb"],
    sort_order: 24,
    body: `# F&B Cash Handling & POS SOP
**Purpose:** accurate, honest, traceable transactions.

## Opening the Drawer
- Count the starting bank with a supervisor or per the log; confirm and initial the amount.
- One person per drawer when possible. Don't share logins.

## Taking Payment
- Ring every item before taking payment — no "I'll remember it." Repeat the total to the guest.
- Cash: count change back out loud. Keep large bills under the tray or drop them.
- Cards: let the guest tap/insert; never write down card numbers. Hand back the card and receipt.
- Comps/discounts/voids require a supervisor and a reason.

## During the Shift
- Keep the drawer closed and locked between sales. Never leave it open or unattended.
- Do large-bill drops to the safe as cash builds up; log each drop.

## Closing / Reconciliation
1. Run the POS end-of-day (Z) report.
2. Count the drawer; subtract the starting bank to get cash sales.
3. Reconcile cash + card totals to the report; record any over/short and a note explaining it.
4. Prepare the deposit/drop per course procedure and secure it.

## Rules
- Report register errors, suspected theft, or counterfeit bills to a supervisor immediately.
- Repeated unexplained shortages are taken seriously.`,
  },

  // ───────────────────────── Pro Shop ─────────────────────────
  {
    slug: "proshop-training-guide",
    title: "Pro Shop Training Guide",
    category: "training",
    roles: ["pro-shop"],
    sort_order: 30,
    body: `# Pro Shop Training Guide
The pro shop is the front door of the course. You set the tone for every round.

## Your Role
- Greet guests, check players in, take tee times and payments, and answer questions.
- Manage the tee sheet and pace of play, coordinate carts, and keep the shop tidy and stocked.
- Sell merchandise, range balls, and food/beverage items as applicable.

## What You'll Learn
1. The tee sheet and check-in system (see Tee-Sheet & Check-In SOP).
2. POS, green fees, cart fees, member vs. guest rates, and merchandise sales.
3. Phone etiquette and booking tee times.
4. Cart coordination with rec aides / outside services and cart cleaning standards.
5. Opening and closing the shop.

## Service Standards
- Greet within a few seconds; smile and use the guest's name when you can.
- Know the day's rates, events, and course conditions (cart path only? frost delay?).
- Answer the phone by the third ring: "Thank you for calling Veterans Memorial Golf Course, this is ____."

## First-Week Checklist
- [ ] Comfortable checking in a player and taking payment
- [ ] Can book and edit a tee time
- [ ] Learned green/cart fee structure and member rates
- [ ] Ran an opening and a closing with a supervisor
- [ ] Reviewed cash handling and cart coordination`,
  },
  {
    slug: "proshop-opening-procedures",
    title: "Pro Shop — Opening Procedures",
    category: "opening-closing",
    roles: ["pro-shop"],
    sort_order: 31,
    body: `# Pro Shop — Opening Procedures

## Arrival
1. Clock in, unlock the shop, turn on lights and music.
2. Check the day's tee sheet, events, weather, and any notes from maintenance (frost delay, cart path only, closures).

## Systems
1. Power up the POS and computer; confirm the tee-sheet system and card reader are working.
2. Count the opening cash drawer; confirm and initial the starting amount.

## Shop & Carts
1. Confirm carts are staged, charged/fueled, and clean (coordinate with rec aides / outside services).
2. Stock scorecards, pencils, tees, range tokens, and any giveaways at the counter.
3. Tidy and face merchandise; check that prices are correct.
4. Set out range baskets/balls if the range is open.

## Course Readiness
1. Confirm with maintenance that the course is open and note any restrictions to tell players.
2. Set up the starter area / first tee as needed.

## Open
- Unlock the front, confirm the first groups, and greet guests on time.`,
  },
  {
    slug: "proshop-closing-procedures",
    title: "Pro Shop — Closing Procedures",
    category: "opening-closing",
    roles: ["pro-shop"],
    sort_order: 32,
    body: `# Pro Shop — Closing Procedures

## Course & Carts
1. Confirm all groups are in and the course is clear.
2. Make sure carts are returned, plugged in/fueled, and cleaned; note any damage (see Cart Cleaning Procedure).
3. Collect and store range balls if applicable.

## Cash / POS
1. Run the end-of-day report on the POS and tee-sheet system.
2. Count the drawer, reconcile cash + cards to sales, record over/short.
3. Prepare the deposit/drop per course procedure and secure it.

## Shop
1. Straighten and face merchandise; restock counter supplies for the morning.
2. Empty trash; quick clean of counters, glass, and floors.
3. Confirm tomorrow's tee sheet and leave notes for the opener.

## Lock Up
1. Power down registers and computers as instructed.
2. Turn off lights, music, and unnecessary equipment.
3. Lock doors, windows, and gates. Set alarm if applicable. Clock out.`,
  },
  {
    slug: "tee-sheet-checkin-sop",
    title: "Tee Sheet & Check-In SOP",
    category: "sop",
    roles: ["pro-shop"],
    sort_order: 33,
    body: `# Tee Sheet & Check-In SOP
**Purpose:** smooth check-ins, accurate billing, and good pace of play.

## Booking a Tee Time
- Collect name, number of players, date/time, and a phone number.
- Confirm the time back to the guest and note carts vs. walking.
- Honor member/guest rules and any event blocks on the sheet.

## Checking In Players
1. Find the group on the tee sheet; confirm number of players and walk/ride.
2. Charge the correct green fee and cart fee (member vs. guest, time-of-day/twilight rates).
3. Provide scorecard, pencils, and any cart assignment.
4. Mark the group "checked in / paid" on the sheet.
5. Remind them of the day's conditions (cart path only, soft course, frost delay).

## Pace of Play & Spacing
- Send groups off at correct intervals; don't double-book a slot.
- Watch for gaps and backups; politely encourage groups to keep pace.

## Changes & No-Shows
- Edit or cancel tee times in the system, not on paper only.
- Note no-shows; follow course policy on holds/deposits.

## Accuracy
- Every player on the course should be checked in and paid. If you comp or adjust, get supervisor approval and note the reason.`,
  },
  {
    slug: "proshop-cash-merchandise-sop",
    title: "Pro Shop Cash & Merchandise SOP",
    category: "sop",
    roles: ["pro-shop"],
    sort_order: 34,
    body: `# Pro Shop Cash & Merchandise SOP
**Purpose:** accurate sales and well-kept inventory.

## Cash Handling
- Count the opening drawer and confirm the starting bank; initial the log.
- Ring every sale; repeat the total; count change back. Keep the drawer closed between sales.
- Cards: let the guest tap/insert; never record card numbers. Return card + receipt.
- Voids, comps, and discounts require supervisor approval and a noted reason.
- Drop large bills to the safe as cash builds; log each drop.

## End of Day
1. Run the Z/end-of-day report.
2. Count the drawer, subtract the bank, reconcile cash + cards to sales, record over/short.
3. Secure the deposit/drop per course procedure.

## Merchandise
- Receive shipments against the packing slip; report shortages/damage.
- Tag items with correct prices; keep displays faced and full.
- Ring merchandise to the correct category so inventory stays accurate.
- Note items that are low or sold out for reordering.

## Inventory Integrity
- No "friend discounts" or unrung items. Employee purchases follow course policy and are rung normally.
- Report suspected theft or repeated discrepancies to a supervisor.`,
  },

  // ───────────────────────── Rec Aides ─────────────────────────
  {
    slug: "rec-aide-training-guide",
    title: "Rec Aide Training Guide",
    category: "training",
    roles: ["rec-aide"],
    sort_order: 40,
    body: `# Rec Aide Training Guide
Rec aides keep the outside running — carts, range, bag drop, and guest help. You're hustling and visible, so attitude and speed matter.

## Your Role
- Stage, clean, and manage the cart fleet.
- Run the driving range: pick balls, fill baskets, keep the line clean.
- Help at bag drop, assist guests, and keep the grounds around the clubhouse tidy.
- Support the pro shop and F&B as needed.

## What You'll Learn
1. Cart staging, charging/fueling, and the Cart Cleaning Procedure.
2. Range operation: ball washing, filling, picking with the cart, and safety.
3. Bag drop and guest assistance etiquette.
4. Daily opening and closing duties.
5. Radio/phone communication with the pro shop.

## Standards
- Move with purpose; guests notice hustle.
- Keep carts clean and ready, the range stocked, and trash picked up.
- Always yield to golfers and keep the range picker clear of players.

## First-Week Checklist
- [ ] Trained on cart staging, charging, and cleaning
- [ ] Operated the range picker safely
- [ ] Learned opening and closing duties
- [ ] Comfortable assisting guests at bag drop
- [ ] Knows how to reach the pro shop quickly`,
  },
  {
    slug: "rec-aide-daily-duties",
    title: "Rec Aide — Daily Duties (Opening & Closing)",
    category: "opening-closing",
    roles: ["rec-aide"],
    sort_order: 41,
    body: `# Rec Aide — Daily Duties (Opening & Closing)

## Opening
1. Clock in; check in with the pro shop for the day's plan, events, and conditions.
2. Pull carts from charging; confirm each is charged/fueled, clean, and safe (lights, brakes, tires).
3. Stage carts at the first tee / staging area, facing out and ready.
4. Set up the range: fill ball baskets, set out mats/stations, empty trash, straighten the line.
5. Set up bag drop; have towels/supplies ready.

## During the Day
- Turn carts quickly between groups: trash out, wipe down, restage (see Cart Cleaning Procedure).
- Keep the range picked and baskets full; never pick while players are hitting toward you.
- Help guests at bag drop and answer questions or radio the pro shop.
- Police the clubhouse grounds and trash cans.

## Closing
1. Confirm all carts are returned; clean each, plug in/fuel, and report damage.
2. Final range pick; bring in baskets/balls; wash and store balls; secure the picker.
3. Stow bag-drop supplies; empty outside trash.
4. Tidy the staging area; report anything unfinished to the pro shop.
5. Clock out.`,
  },
  {
    slug: "range-outside-services-sop",
    title: "Range & Outside Services SOP",
    category: "sop",
    roles: ["rec-aide"],
    sort_order: 42,
    body: `# Range & Outside Services SOP
**Purpose:** a safe, stocked range and a well-run outside operation.

## Driving Range Safety
- Never pick balls while golfers are hitting into the picking zone — wait, signal, or pick from the side as trained.
- Wear seatbelt and keep the cage/screen in place on the picker. Drive predictable patterns.
- Keep the hitting line clear of staff and equipment during open hours.

## Ball Management
- Pick on a schedule and whenever the field is heavy. Wash balls and remove damaged ones.
- Keep baskets and the dispenser full; restock stations with mats/tees as needed.

## Cart Fleet
- Stage carts charged/fueled, clean, and safe. Rotate the fleet so all carts get used and charged.
- Inspect for damage and warning lights; tag and pull any unsafe cart from service.
- Follow the Cart Cleaning Procedure for turns and end-of-day.

## Bag Drop & Guest Service
- Greet arriving guests, help unload bags, and direct them to the pro shop.
- Load bags onto carts when asked; handle clubs with care.

## Grounds
- Keep clubhouse entries, the range line, and staging areas clean and free of trash and clutter.

## Communication
- Keep your radio/phone on. Tell the pro shop about backups, cart shortages, weather, or any incident right away.`,
  },

  // ───────────────────────── Manager / GM tools ─────────────────────────
  {
    slug: "gm-first-one-on-one",
    title: "GM First 1:1 — Transition Meeting",
    category: "worksheet",
    roles: ["manager"],
    sort_order: 50,
    body: `# GM First 1:1 — Transition Meeting
A guide for your first one-on-one with each employee as the new General Manager. You already know each other, so skip the introductions — the goal is to listen, understand how they feel about the change, and learn where the operation can get better. Aim to talk 20%, listen 80%. Take notes. Don't get defensive.

**Employee:** ____________________   **Role:** ____________________   **Date:** ____________

## Before you start (notes to self)
- This is about them, not about defending past decisions. Ask, then listen.
- It's okay to say "I don't know yet" or "let me think on that and get back to you."
- End with one or two things you'll actually follow up on — then do them. Follow-through is how you earn trust in the new role.

## Open — name the change honestly
Suggested opener: "You've known me as the superintendent, and now I'm stepping into the GM role. That's a change for both of us, and I wanted to sit down one-on-one to hear how you're doing and what you think. There are no wrong answers here, and nothing you say leaves this room as a complaint against you."

- How are you feeling about the change in leadership?
  - ______________________________________________________________
- Is there anything about me moving into this role you want to ask about or get off your chest?
  - ______________________________________________________________

## Get to know them
- How long have you been here, and what keeps you here?
  - ______________________________________________________________
- What part of your job do you enjoy most? What part do you like least?
  - ______________________________________________________________
- What are you good at that we maybe don't take enough advantage of?
  - ______________________________________________________________
- Anything going on outside of work I should keep in mind (schedule needs, school, family)?
  - ______________________________________________________________

## Their view of the operation
- What's working well right now that we should be sure to keep?
  - ______________________________________________________________
- What's frustrating, or what slows you down during a normal day?
  - ______________________________________________________________
- If you had my job for a day, what's the first thing you'd change?
  - ______________________________________________________________
- What do you need to do your best work (tools, training, communication, staffing)?
  - ______________________________________________________________

## What they need from me
- What do you hope I keep doing? What do you hope I do differently as GM?
  - ______________________________________________________________
- How do you like to get feedback and direction — in the moment, scheduled, written, in person?
  - ______________________________________________________________
- How often would you like to check in like this going forward?
  - ______________________________________________________________

## Their goals
- Is there anything you'd like to learn, take on, or grow into here?
  - ______________________________________________________________

## Close
- Say back what you heard, so they know you were listening:
  - ______________________________________________________________
- One or two things I will follow up on (and by when):
  - ______________________________________________________________

**Follow-up date:** ______________`,
  },
  {
    slug: "gm-30-day-checkin",
    title: "New Employee 30-Day Check-In (1:1)",
    category: "worksheet",
    roles: ["manager"],
    sort_order: 51,
    body: `# New Employee 30-Day Check-In (1:1)
Use this around a new hire's 30-day mark. It's a two-way conversation: make sure they're settling in and have what they need, give early feedback, and confirm the job is what they expected. Keep it supportive — the goal is to set them up to succeed and catch any problems early.

**Employee:** ____________________   **Role:** ____________________   **Start date:** __________   **Date:** ____________

## Settling in
- How's it going so far? Do you feel welcomed by the team?
  - ______________________________________________________________
- Anything that's surprised you — good or bad — since you started?
  - ______________________________________________________________

## Onboarding & training
- Did the training prepare you for the job? What was missing or unclear?
  - ______________________________________________________________
- Do you know where to find the SOPs and who to ask when you're unsure?
  - ______________________________________________________________
- Is there anything you'd still like more training on?
  - ______________________________________________________________

## The work
- What part of the job is going well for you?
  - ______________________________________________________________
- What's been the hardest or most confusing?
  - ______________________________________________________________
- Do you have the tools, equipment, and PPE you need?
  - ______________________________________________________________

## Expectations & early feedback (from me)
- Is your role — and what "good work" looks like — clear to you?
  - ______________________________________________________________
- What you're doing well so far:
  - ______________________________________________________________
- One thing to focus on or adjust:
  - ______________________________________________________________

## Fit & outlook
- Is the job what you expected when you took it?
  - ______________________________________________________________
- What do you enjoy most? Is anything making you reconsider being here?
  - ______________________________________________________________

## Goals for the next 60–90 days
- ______________________________________________________________
- ______________________________________________________________

## Close
- Action items (both of us):
  - ______________________________________________________________
- Are we both good to keep going? Anything you need from me?
  - ______________________________________________________________

**Next check-in date:** ______________`,
  },
  {
    slug: "gm-standard-one-on-one",
    title: "GM 1:1 — Standard Check-In",
    category: "worksheet",
    roles: ["manager"],
    sort_order: 52,
    body: `# GM 1:1 — Standard Check-In
Your recurring one-on-one once the first meeting is done. Keep it short and regular — every two to four weeks works for a small crew. Fill it out together, listen more than you talk, and always close with clear next steps.

**Employee:** ____________________   **Role:** ____________________   **Date:** ____________

## Since last time
- Wins / what went well:
  - ______________________________________________________________
- What got in the way or was frustrating:
  - ______________________________________________________________
- Did the things we agreed on last time get done? (both of us)
  - ______________________________________________________________

## Right now
- How are your workload and the schedule (1–5)? ______   Anything to adjust?
  - ______________________________________________________________
- What do you need from me to do your job well this stretch?
  - ______________________________________________________________
- Anything happening on the course, or with guests or members, I should know about?
  - ______________________________________________________________

## Feedback — both directions
- Something you're doing well that I want to recognize:
  - ______________________________________________________________
- One thing to keep working on or do differently:
  - ______________________________________________________________
- Feedback for me or the operation:
  - ______________________________________________________________

## Goals & development
- Progress on your goals; anything you want to learn or take on next:
  - ______________________________________________________________

## Action items
| Action | Owner | By when |
| --- | --- | --- |
| ____________________ | ________ | ________ |
| ____________________ | ________ | ________ |

**Next check-in:** ______________`,
  },
];
