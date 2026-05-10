/**
 * Fix procedures used by the Course Action Plan report.
 *
 * Each issue type maps to a single procedure containing:
 *   - Cultural / mechanical work the crew should perform (always present)
 *   - Optional chemical applications (fertilizer, herbicide, fungicide,
 *     insecticide, wetting agent, moss control, etc.) where they are
 *     genuinely the standard treatment for the issue.
 *
 * Important: by superintendent direction, GRUB DAMAGE procedures intentionally
 * do NOT include any chemical applications — they only address the bare
 * spot left behind. Every other relevant issue type may carry chemical
 * recommendations.
 *
 * The chemical block lists product TYPES and EXAMPLE products. The
 * superintendent / spray contractor still picks the actual product based on
 * label, regional availability, and current pest pressure.
 */

import type {
  HoleIssueType,
  GreenIssueType,
  TaskPriority,
} from "@/types/database";

export interface ActionPlanStep {
  /** What to do, written as an imperative sentence. */
  action: string;
  /** Optional clarifier: tools, materials, or quantitative target. */
  detail?: string;
}

export interface ChemicalStep {
  /** Plain-English class — e.g. "Fungicide", "Pre-emergent herbicide". */
  product_type: string;
  /** Example products in that class. Picker chooses one based on label. */
  product_examples: string[];
  /** Application rate or quantity per area. */
  rate: string;
  /** Spray, granular, drench, foliar, etc. */
  method: string;
  /** When to apply — temperature window, growth stage, time of day. */
  timing: string;
  /** Restricted-Entry Interval in hours. null when N/A. */
  rei_hours: number | null;
  /** Safety / use precautions specific to this application. */
  precautions: string[];
}

export interface ActionPlanProcedure {
  /** Friendly title for the procedure. */
  title: string;
  /** When to do it — e.g. "Dry morning, no frost, ground not frozen". */
  best_window: string;
  /** Tools and materials needed (no chemicals — chemicals are listed below). */
  tools_needed: string[];
  /** Recommended crew size. */
  crew: string;
  /** Estimated time on site for one occurrence (best, single area). */
  duration: string;
  /** Step-by-step procedure for cultural/mechanical work. */
  steps: ActionPlanStep[];
  /**
   * Optional chemical applications that are part of the standard treatment.
   * Empty / undefined = no chemicals recommended for this issue.
   */
  chemicals?: ChemicalStep[];
  /** Follow-up tasks after the initial fix. */
  follow_up: string[];
  /** Notes on what to monitor for / when to repeat. */
  monitor: string;
}

// ── HOLE / FAIRWAY procedures ──────────────────────────────────────────────

export const holeFixProcedures: Record<HoleIssueType, ActionPlanProcedure> = {
  fungus_disease: {
    title: "Disease Diagnosis, Spray, and Cultural Recovery",
    best_window: "Mornings when dew has lifted; avoid mowing wet leaf tissue",
    tools_needed: [
      "Whipping pole or bamboo cane",
      "Hose for syringe-watering",
      "Walk-behind mower with sharpened reels/blades",
      "Backpack blower for dew removal",
      "Tank sprayer or contracted spray rig",
    ],
    crew: "1–2 crew members + spray contractor for chemical step",
    duration: "30–45 min/zone for cultural; spray pass per label",
    steps: [
      { action: "Whip or blow off dew at sunrise to break the leaf-wetness window.", detail: "Pole-drag, cane, or backpack blower across affected area." },
      { action: "Identify the specific disease before treating.", detail: "Dollar spot, brown patch, pythium, fairy ring — each has a different curative product." },
      { action: "Raise mowing height by 1 notch on the affected hole until recovery.", detail: "Reduces stress; sharpen reels before next cut." },
      { action: "Switch irrigation to a single deep early-morning cycle (4–6 a.m.).", detail: "Eliminates evening watering so leaves dry quickly." },
      { action: "Hand-water any localized dry-stress patches with a fine spray nozzle.", detail: "Healthy turf resists disease — keep stressed spots from collapsing." },
      { action: "Open the canopy: prune low limbs and underbrush blocking morning sun.", detail: "Faster drying = less disease pressure." },
      { action: "Apply curative fungicide per label (see Chemical Applications below).", detail: "Coordinate with the spray contractor; document product, rate, and date." },
    ],
    chemicals: [
      {
        product_type: "Curative Fungicide (broad-spectrum)",
        product_examples: ["Daconil Ultrex (chlorothalonil)", "Heritage (azoxystrobin)", "Banner Maxx (propiconazole)"],
        rate: "Per label — typically 3.2–4.0 oz/1000 sq ft for chlorothalonil; 0.2–0.4 oz/1000 sq ft for azoxystrobin",
        method: "Foliar spray — 2 gal water/1000 sq ft",
        timing: "Apply at first sign of disease; avoid mid-day heat; rotate FRAC group every other application to prevent resistance",
        rei_hours: 12,
        precautions: [
          "Wear chemical-resistant gloves, long sleeves, eye protection.",
          "Post REI signs at all entry points to the treated area.",
          "Do not apply within 24 hrs of expected rain unless label allows.",
          "Calibrate sprayer before each use — verify gpa output.",
        ],
      },
    ],
    follow_up: [
      "Re-inspect daily for 7 days; photograph spread or recovery.",
      "Sharpen reels/blades after every other cut — clean cuts heal faster.",
      "Schedule preventive fungicide rotation if disease recurs in same zone.",
    ],
    monitor: "Patch growth should stop within 5–7 days of fungicide + cultural work; healthy edges fill in over 2–3 weeks.",
  },

  dry_spot: {
    title: "Hand-Water, Vent, and Wetting-Agent Treatment",
    best_window: "Early morning or evening, 60–80°F, no wind",
    tools_needed: [
      "Hose with shower-head wand or syringe nozzle",
      "Soil probe / tile probe",
      "Pitchfork or solid-tine pencil aerator",
      "Tank sprayer for wetting agent",
      "Bucket or backpack waterer for remote spots",
    ],
    crew: "1 crew member",
    duration: "20–30 min per dry spot + wetting agent pass",
    steps: [
      { action: "Probe the spot to confirm dry rootzone (top 4–6 inches).", detail: "If probe pulls dust, the spot is hydrophobic — wetting agent + venting needed." },
      { action: "Solid-tine the spot with a pitchfork or pencil aerator on 2-inch spacing.", detail: "Opens channels for water to penetrate the dry layer." },
      { action: "Syringe-water by hand, slowly, in 3 passes.", detail: "Walk away 5 min between passes so water can soak instead of run off." },
      { action: "Re-probe after watering; soil should pull as a moist core.", detail: "Repeat hand-watering daily until rootzone holds moisture on its own." },
      { action: "Apply wetting agent to chronic LDS spots (see Chemical Applications).", detail: "Drench-style application followed by deep watering to move it into the rootzone." },
      { action: "Check the irrigation head(s) covering this spot.", detail: "Adjust arc, replace nozzle, or raise head if it's the source of the dry pattern." },
      { action: "Mark the spot with a small flag so the morning crew checks it daily.", detail: "Spots come back fast in summer heat — visible reminder helps." },
    ],
    chemicals: [
      {
        product_type: "Soil Surfactant / Wetting Agent",
        product_examples: ["Revolution", "Cascade Plus", "Aqueduct", "Tournament Ready"],
        rate: "Per label — typically 6 oz/1000 sq ft for monthly programs; 12 oz/1000 sq ft for spot/curative",
        method: "Spray + immediate water-in (1/4 inch irrigation)",
        timing: "Apply early morning before heat; reapply every 28 days during stress season",
        rei_hours: 4,
        precautions: [
          "Avoid spraying onto cart paths or impervious surfaces.",
          "Water in within 1 hr of application or product can leave a film.",
          "Keep golfers off treated area until product is watered in.",
        ],
      },
    ],
    follow_up: [
      "Hand-water daily for the next 5–7 mornings.",
      "Re-aerate with solid tines every 2 weeks until the spot stops re-appearing.",
      "Reapply wetting agent on a 28-day cycle through the heat-stress season.",
    ],
    monitor: "Color and footprint should recover in 5–10 days. Persistent dry spots after 2 weeks of treatment = irrigation coverage problem.",
  },

  wet_area: {
    title: "Surface Drainage and Venting",
    best_window: "After the area has dried enough to walk without sinking",
    tools_needed: [
      "Solid-tine aerator (1/2-inch tines)",
      "Shovels (round-point and square)",
      "Sand topdresser or wheelbarrows",
      "Coarse drainage sand or sand/peat mix",
      "Pitchfork",
      "Tile probe to find buried drains",
    ],
    crew: "2–3 crew members",
    duration: "1–2 hours",
    steps: [
      { action: "Walk the area at the wettest point and mark the low spot with paint or flags.", detail: "That mark is where the next drain inlet — or fill — should go." },
      { action: "Probe for any existing drain lines or catch basins.", detail: "Often the drain is just buried under sod — uncover and clean it." },
      { action: "Solid-tine vent the wet zone on 4-inch spacing, 4 inches deep.", detail: "Provides immediate gas exchange and drying." },
      { action: "Pull-back sod in the lowest spot, dig a small sump or french-drain trench down to native sand.", detail: "12–18 inches deep, sloped toward the nearest existing drain or off the playing surface." },
      { action: "Backfill the trench with coarse drainage sand and replace the sod.", detail: "Tamp lightly; topdress sand into the seam so it knits back together." },
      { action: "Topdress the entire wet zone with a thin layer of sand and drag in.", detail: "Surface sand wicks moisture away and firms footing." },
      { action: "Reduce that zone's irrigation run time by 20–30% until the area firms up.", detail: "The hand-controller or central system can hold this overnight." },
    ],
    follow_up: [
      "Re-vent every 2 weeks until rain events drain in under 6 hours.",
      "Schedule a deep-tine pass on the hole at the next maintenance window.",
      "If the wet area re-forms in the same place after each rain, plan a permanent drain installation.",
    ],
    monitor: "Walk the spot 4 hours after the next rain — your boot should not leave standing water in the print.",
  },

  bare_spot: {
    title: "Slit-Seed / Sod Repair with Starter Fertilizer",
    best_window: "Spring (Apr–May) or early fall (Aug–Sep), soil temp 55°F+",
    tools_needed: [
      "Sod cutter or sharp spade",
      "Slit seeder OR scarifier rake",
      "LOWMOWBLUES Kentucky Bluegrass Blend (50 lb bag)",
      "Starter fertilizer",
      "BGREENPEATB2 Green Sand/Peat Mix (topdress/divot blend)",
      "Drag mat or steel rake",
      "Hose / sprinkler",
      "Sod plugs from a nursery green or rough-edge area (if patching with sod)",
    ],
    crew: "1–2 crew members",
    duration: "30–60 min per bare spot",
    steps: [
      { action: "Clean out the dead/thin turf — scrape down to fresh soil with a sod cutter or square spade.", detail: "About 1 inch deep is enough." },
      { action: "Loosen the exposed soil with a hand cultivator or pitchfork.", detail: "Seed sits in soft seedbed, not compacted ground." },
      { action: "If small (under 2 sq ft): slit-seed or hand-broadcast seed at 1.5x normal rate, then rake in.", detail: "LOWMOWBLUES KBG Blend — 5–6 lbs/1,000 sq ft." },
      { action: "If large (over 2 sq ft) and a tournament is approaching: cut sod from a nursery area and patch.", detail: "Match thickness — pound flush with surrounding grade." },
      { action: "Apply starter fertilizer at label rate to the patch (see Chemical Applications).", detail: "Phosphorus is critical for new root development." },
      { action: "Topdress lightly with Green Sand/Peat Mix to cover seed and protect against birds and washout.", detail: "BGREENPEATB2 at 1/8 inch — peat blend retains moisture for better germination than straight sand." },
      { action: "Tamp or roll lightly so seed contacts soil.", detail: "Seed-to-soil contact is the #1 factor in germination." },
      { action: "Water 3–4 times per day with a fine mist for 14 days.", detail: "Short bursts — never let the seedbed dry out, never puddle." },
      { action: "Rope off or flag the area so it isn't mowed flat.", detail: "Skip the spot for the first 2 mowings after germination." },
    ],
    chemicals: [
      {
        product_type: "Starter Fertilizer (high P)",
        product_examples: ["18-24-12 starter", "12-25-12 starter", "Lesco Starter Fert"],
        rate: "1 lb N / 1000 sq ft (≈ 5.5 lb of 18-24-12 per 1000 sq ft)",
        method: "Granular broadcast over the seedbed; water in immediately",
        timing: "At time of seeding; second application 4 weeks after germination",
        rei_hours: null,
        precautions: [
          "Sweep granules off cart paths and into the seedbed.",
          "Don't exceed label rate — burns seedlings.",
          "Water in within 1 hr to dissolve granules.",
        ],
      },
    ],
    follow_up: [
      "First mow when seedlings are 1.5x the bench height.",
      "Reduce watering to once daily once seedlings hold green color overnight.",
      "Topdress lightly again at 4 weeks to smooth the patch.",
      "Second starter fert app at 4 weeks; switch to maintenance fert at 8 weeks.",
    ],
    monitor: "Germination by day 7–10 (cool-season); full recovery 4–6 weeks. Re-seed thin patches at week 2 if coverage is uneven.",
  },

  weed_pressure: {
    title: "Selective Herbicide and Cultural Suppression",
    best_window: "Pre-emergent: spring soil temp 50–55°F. Post-emergent: actively growing weeds, 60–85°F.",
    tools_needed: [
      "Hand weeding knife / dandelion fork",
      "Bucket for pulled weeds",
      "Slit seeder + LOWMOWBLUES Kentucky Bluegrass Blend (50 lb bag)",
      "Topdresser",
      "Sharp mower",
      "Tank sprayer / contracted spray rig",
    ],
    crew: "1–3 crew members + spray contractor",
    duration: "1–2 hours per hole; spray pass per label",
    steps: [
      { action: "Identify the weed species before picking a herbicide.", detail: "Crabgrass, Poa annua, dandelions, clover — each requires a different product." },
      { action: "Hand-pull isolated patches with a fork — get the full root.", detail: "Bag and remove; do not leave on turf." },
      { action: "Apply pre-emergent herbicide in early spring (see Chemical Applications).", detail: "Stops weed seed germination before the season starts." },
      { action: "For active broadleaf weeds: apply post-emergent selective herbicide per label.", detail: "Spot-treat smaller infestations; broadcast for large areas." },
      { action: "Mow the hole at the recommended bench height (do not scalp).", detail: "Dense, taller turf shades out weed seedlings." },
      { action: "Slit-seed or overseed thin/bare areas at 1.5x normal rate.", detail: "Crowds out new weeds before they can germinate." },
      { action: "Topdress lightly to cover bare seedbeds.", detail: "BGREENPEATB2 Green Sand/Peat Mix at 1/8 inch." },
      { action: "Water-in deeply once, then keep the seedbed moist for 14 days.", detail: "Establish the desired turf as quickly as possible." },
    ],
    chemicals: [
      {
        product_type: "Pre-emergent Herbicide (crabgrass / Poa)",
        product_examples: ["Barricade (prodiamine)", "Dimension (dithiopyr)", "Pendulum (pendimethalin)"],
        rate: "Per label — prodiamine typically 0.5–0.75 lb ai/acre split spring + fall",
        method: "Granular broadcast or spray; water in 0.5 inch within 24 hrs",
        timing: "Spring app when soil temps reach 50–55°F at 4 inches; fall app for Poa annua control 6–8 weeks before frost",
        rei_hours: 12,
        precautions: [
          "Do not apply to areas being seeded that season — pre-emergents prevent ALL seed germination.",
          "Wear gloves and long sleeves during loading.",
          "Sweep granules off paths.",
        ],
      },
      {
        product_type: "Post-emergent Selective Broadleaf Herbicide",
        product_examples: ["Trimec Classic (2,4-D + MCPP + dicamba)", "Speedzone", "T-Zone SE"],
        rate: "Per label — typically 1.0–1.5 oz/1000 sq ft for spot treatment",
        method: "Foliar spray on actively growing weeds; spot-spray or broadcast",
        timing: "60–85°F day temps; weeds actively growing; no rain forecast for 6 hrs",
        rei_hours: 12,
        precautions: [
          "Drift control: use coarse-droplet nozzles, avoid wind > 8 mph.",
          "Keep away from desirable broadleaf ornamentals (flower beds, trees).",
          "Wear chemical-resistant gloves and goggles.",
          "Post REI signs at entry points.",
        ],
      },
    ],
    follow_up: [
      "Walk-and-pull pass every 7–10 days during the growing season.",
      "Repeat slit-seed if weeds rebound — denser turf is the best long-term defense.",
      "Schedule fall pre-emergent for Poa annua control.",
    ],
    monitor: "Active weeds should yellow within 5 days of post-emergent and die back within 14 days. Density should improve over 4 weeks of overseeding + density work.",
  },

  pest_damage: {
    title: "Insecticide Application and Mechanical Recovery",
    best_window: "Soap-flush in early morning to ID; spray in evening for caterpillars",
    tools_needed: [
      "Hose + bucket for soap-flush detection",
      "Slit seeder / overseeder",
      "BGREENPEATB2 Green Sand/Peat Mix",
      "Sod from a nursery area for severe patches",
      "Drag mat",
      "Tank sprayer / spreader",
    ],
    crew: "1–2 crew members + spray contractor for chemical step",
    duration: "30–90 min depending on extent + spray pass",
    steps: [
      { action: "Soap-flush a 1-sq-ft area to confirm what pest is active.", detail: "2 tbsp dish soap in 2 gal water, pour over turf, watch for 5 min." },
      { action: "Hand-pick or rake out exposed insects after the flush.", detail: "Mechanical removal reduces population without chemicals." },
      { action: "Apply labeled insecticide for the identified pest (see Chemical Applications).", detail: "Coordinate with spray contractor; document target, product, rate, date." },
      { action: "Rake out and remove all dead/damaged turf debris.", detail: "Open the canopy so light reaches new seedlings." },
      { action: "Slit-seed damaged areas with LOWMOWBLUES KBG Blend at 1.5x rate.", detail: "5–6 lbs/1,000 sq ft; repair areas heal faster than waiting on existing turf." },
      { action: "Topdress lightly with BGREENPEATB2 Green Sand/Peat Mix and drag-in to settle seed.", detail: "1/8 inch; peat blend retains moisture and aids germination." },
      { action: "Water to keep the seedbed moist; switch to deep, infrequent watering once turf is up.", detail: "Stronger root system = better tolerance for next outbreak." },
      { action: "Rope off the worst spots for 2 weeks if traffic will damage recovery.", detail: "Bird and animal scratching makes pest damage worse." },
    ],
    chemicals: [
      {
        product_type: "Surface-feeding Insecticide (caterpillars / armyworms)",
        product_examples: ["Acelepryn (chlorantraniliprole)", "Provaunt (indoxacarb)", "Dylox (trichlorfon)"],
        rate: "Per label — Acelepryn 0.1–0.4 fl oz/1000 sq ft",
        method: "Foliar spray; water-in lightly per label",
        timing: "Late afternoon / early evening when caterpillars feed; avoid mid-day heat",
        rei_hours: 4,
        precautions: [
          "Wear gloves, long sleeves; avoid skin contact.",
          "Check label for pollinator-protection language; spray after sundown to protect bees.",
          "Post REI signs at entry points.",
        ],
      },
    ],
    follow_up: [
      "Re-flush 7 days later to confirm population dropped.",
      "If pest counts stay above threshold, rotate to a different mode of action.",
    ],
    monitor: "Re-growth visible in 10–14 days. Watch for bird flocks or skunk digging — both signal continued insect activity.",
  },

  // ── GRUB DAMAGE — bare spot only, NO chemicals (per superintendent direction) ──
  grub_damage: {
    title: "Grub-Damage Bare Spot Repair (No Chemicals)",
    best_window: "After active grub feeding has stopped — late fall or after pupation in early summer",
    tools_needed: [
      "Sharp spade and sod cutter",
      "Sod plugs / new sod from nursery",
      "Slit seeder + LOWMOWBLUES Kentucky Bluegrass Blend (50 lb bag)",
      "BGREENPEATB2 Green Sand/Peat Mix",
      "Drag mat or steel rake",
      "Roller or tamp",
      "Hose / sprinkler",
      "Rope or flags to mark recovery area",
    ],
    crew: "1–2 crew members",
    duration: "30–90 min per bare spot",
    steps: [
      { action: "Cut out and remove the dead, grub-killed turf with a sod cutter or square spade.", detail: "Take it down to clean soil — about 1 inch deep." },
      { action: "Loosen the exposed soil with a hand cultivator or pitchfork.", detail: "Roots couldn't grow in the chewed-up, voided soil — break it up." },
      { action: "Re-firm the soil and bring it level with surrounding grade.", detail: "Tamp or roll lightly." },
      { action: "If small (under 2 sq ft): slit-seed or broadcast seed at 1.5x rate.", detail: "LOWMOWBLUES Kentucky Bluegrass Blend — 5–6 lbs/1,000 sq ft." },
      { action: "If large (over 2 sq ft) or a tournament is approaching: lay sod cut from a nursery area.", detail: "Match thickness — pound flush with surrounding grade." },
      { action: "Topdress lightly with BGREENPEATB2 Green Sand/Peat Mix to cover seed.", detail: "1/8 inch — peat mix retains moisture and aids germination." },
      { action: "Tamp or roll lightly so seed/sod contacts soil.", detail: "Seed-to-soil contact is the #1 factor in germination." },
      { action: "Water 3–4 times per day with a fine mist for 14 days (seed) or daily deep water (sod).", detail: "Don't let the seedbed dry out, never puddle." },
      { action: "Rope off or flag the area so it isn't mowed flat or trafficked.", detail: "Skip the spot for the first 2 mowings after germination." },
    ],
    follow_up: [
      "First mow when seedlings are 1.5x the bench height (or 7–10 days after laying sod).",
      "Reduce watering to once daily once seedlings hold green color overnight.",
      "Topdress lightly again at 4 weeks to smooth the patch.",
    ],
    monitor: "Germination by day 7–10 for seed; sod knit-in 7–14 days. Full recovery 4–6 weeks.",
  },

  mulch_pile: {
    title: "Spread or Remove Mulch Pile",
    best_window: "Anytime ground is dry enough to walk on",
    tools_needed: [
      "Wheelbarrow or utility cart",
      "Mulch fork",
      "Round-point shovel",
      "Steel rake",
      "Tarp for hauling away if removing",
    ],
    crew: "1–2 crew members",
    duration: "30–60 min per pile",
    steps: [
      { action: "Decide: spread or haul off, based on bed needs.", detail: "Beds within 100 ft of the pile usually take the mulch; otherwise haul." },
      { action: "If spreading: fork mulch into wheelbarrow loads and distribute around tree bases / beds.", detail: "Target depth: 2–3 inches, kept 3–6 inches off trunks (no volcanoes)." },
      { action: "Rake mulch evenly with the steel rake; smooth bed edges.", detail: "Even depth keeps moisture consistent and looks finished." },
      { action: "If hauling: shovel and tarp-drag to the dump pile or compost area.", detail: "Sweep up loose mulch from any walked-on turf." },
      { action: "Blow off cart paths and turf edges where mulch landed during the move.", detail: "Loose mulch under mowers can scalp turf and damage reels." },
    ],
    follow_up: [
      "Walk the area in 24 hrs to confirm no mulch is left on turf.",
      "If pile location was on turf, monitor for compaction and re-seed/topdress if needed.",
    ],
    monitor: "No follow-up needed once spread evenly and bed edges look finished.",
  },

  sticks_around_tree: {
    title: "Tree-Base Cleanup",
    best_window: "Anytime — best after a storm or pruning event",
    tools_needed: [
      "Backpack blower",
      "Hand pruners",
      "Tarp or wheelbarrow",
      "Loppers (for thicker fallen branches)",
    ],
    crew: "1 crew member",
    duration: "15–30 min per tree",
    steps: [
      { action: "Walk the tree base and pick up all sticks and large debris.", detail: "Pile onto the tarp." },
      { action: "Look up — prune any obviously dead/hanging limbs that will drop more sticks.", detail: "Remove small dead limbs with hand pruners; flag big ones for arborist." },
      { action: "Blow leaves and small debris back from the trunk to the drip-line.", detail: "Open base = healthy bark, easier mowing." },
      { action: "Haul tarp/cart to the brush pile.", detail: "Don't leave debris piled at the maintenance road." },
      { action: "Tap mower deck around the tree once cleanup is done.", detail: "Confirms safe to mow — no missed sticks to throw." },
    ],
    follow_up: [
      "Re-walk after the next storm.",
      "If branches keep falling from the same tree, escalate to a certified arborist.",
    ],
    monitor: "No follow-up beyond the next storm.",
  },

  sticks_on_ground: {
    title: "Course Stick & Debris Cleanup",
    best_window: "First thing in the morning — before mowers go out",
    tools_needed: [
      "Backpack blower",
      "Pickup stick / grabber",
      "Wheelbarrows or utility cart",
      "Tarp",
    ],
    crew: "2 crew members per 3 holes",
    duration: "20–30 min per hole",
    steps: [
      { action: "Walk the hole start-to-finish, picking up every stick longer than 3 inches.", detail: "Mowers throw shorter sticks, but bigger ones break reels and blades." },
      { action: "Blow leaves and small debris off the playing corridor and into the rough.", detail: "Faster than raking and lighter on the turf." },
      { action: "Load debris into the cart; don't leave piles at greenside or tee-side.", detail: "Visible piles look unfinished and create their own hazards." },
      { action: "Haul to brush pile or compost area.", detail: "Mark the compost area boundary so seasonal staff know where to dump." },
      { action: "Inspect for source — any tree dropping more than 5 sticks daily needs an arborist look.", detail: "Repeat cleanup is wasted labor without addressing the source tree." },
    ],
    follow_up: [
      "Repeat after every storm.",
      "Daily walk before mow-out during high-leaf seasons.",
    ],
    monitor: "Course should stay clean for 24–72 hrs in calm weather. If sticks reappear daily, identify the tree and schedule pruning.",
  },

  felled_tree: {
    title: "Felled Tree Processing & Site Restoration",
    best_window: "Anytime ground is firm; coordinate around play",
    tools_needed: [
      "Chainsaw (with cleared operator)",
      "Wood chipper",
      "Tractor or utility vehicle with cart",
      "Cant hook / log peavey",
      "Round-point and square shovels",
      "Rake and topdressing sand for impact-zone repair",
      "Sod plugs or seed for divot repair",
    ],
    crew: "3+ crew members (one chainsaw operator, one chipper feeder, one ground)",
    duration: "Half-day to full day",
    steps: [
      { action: "Set up safety perimeter — flag or rope off 100 ft around the work zone.", detail: "Stop play through the hole until the tree is processed." },
      { action: "Buck the trunk into manageable rounds (16–24 inches) starting from the top.", detail: "Working tip-to-base prevents the trunk from rolling unexpectedly." },
      { action: "Limb the smaller branches into chip-friendly lengths and feed the chipper.", detail: "Run the chipper away from greens — chips can stain putting surfaces." },
      { action: "Roll or skid trunk rounds to the cart and haul to the wood pile or firewood shed.", detail: "Heavy rounds — get help, use the peavey, never lift solo." },
      { action: "Repair the impact zone where the tree hit ground.", detail: "Loosen compacted soil with a fork, fill divots with sand/seed, smooth with a rake." },
      { action: "If the stump is a tripping or mowing hazard, mark it and schedule grinding.", detail: "Stump grinder rental or arborist follow-up." },
      { action: "Drag the area smooth, water in any seed, rope off the patch.", detail: "Same recovery routine as a bare spot." },
      { action: "Inspect adjacent trees for damage from the fall.", detail: "A failed tree often leans on neighbors and weakens them." },
    ],
    follow_up: [
      "Re-water the impact patch daily for 14 days if seeded.",
      "Schedule stump grinding within 2 weeks.",
      "Plan replacement planting in next dormant season if appropriate.",
    ],
    monitor: "Impact zone full recovery 4–8 weeks. Adjacent trees: re-inspect at next storm.",
  },

  mechanical_damage: {
    title: "Mower / Equipment Damage Repair",
    best_window: "Same day if possible — fresh damage repairs cleanest",
    tools_needed: [
      "Sand-and-seed bottle or bucket",
      "Sharp spade",
      "Drag mat",
      "Roller (small walk-behind)",
      "Sod plugs from a nursery area",
      "Mower bench-setting tool",
    ],
    crew: "1 crew member for repair, 1 mechanic for the equipment",
    duration: "20–60 min depending on extent",
    steps: [
      { action: "Identify the equipment that caused the damage and tag it out of service.", detail: "Don't keep mowing with the same setup — you'll keep making damage." },
      { action: "Trim ragged edges of the damaged turf with a spade — make a clean rectangle.", detail: "Clean edges heal faster than tears." },
      { action: "Loosen the exposed soil with a fork.", detail: "Compacted strip from a wheel pass needs to be opened." },
      { action: "Patch with sod plugs (faster) or sand/seed (cheaper).", detail: "Match the surrounding turf type and density." },
      { action: "Topdress and tamp / roll flush with surrounding grade.", detail: "No lip = no scalp on the next mowing pass." },
      { action: "Water in well; hand-water daily until the patch holds color.", detail: "Same routine as bare-spot recovery." },
      { action: "Send the offending mower to the mechanic for bench-set + reel/blade sharpening.", detail: "Document what was wrong (tracking, scalp, tear) so it doesn't repeat." },
    ],
    follow_up: [
      "Walk the area daily for 5 days.",
      "Sharpen all reels/blades on the same machine class to prevent repeats.",
      "Re-train operator if pattern damage points to driving habit.",
    ],
    monitor: "Patch should knit in 2–3 weeks for sod, 4–6 weeks for seed.",
  },

  drainage: {
    title: "Hand-Dug Drainage Improvement",
    best_window: "Dry conditions; avoid the day of or day after heavy rain",
    tools_needed: [
      "Tile probe",
      "Round-point shovel + trenching shovel",
      "Pickaxe for hard layers",
      "4-inch perforated drain pipe + sock",
      "Coarse drainage gravel",
      "Drainage sand",
      "Sod cutter for clean re-laying",
      "Tamper and roller",
    ],
    crew: "3 crew members",
    duration: "Half-day per 50 ft of new drain",
    steps: [
      { action: "Walk the hole during/after rain and mark the actual flow path.", detail: "Paint marks the centerline of the new drain run." },
      { action: "Probe for any existing drains — clean them out first; new drain is last resort.", detail: "Most 'drainage problems' are blocked existing drains." },
      { action: "Cut and lift sod over the trench line in 18-inch strips.", detail: "Stack sod grass-side-down so it stays alive while the trench is open." },
      { action: "Trench 12–18 inches deep, sloping 1% (1 inch per 8 ft) toward the outlet.", detail: "Slope is what makes drainage work — use a line level if needed." },
      { action: "Lay 1–2 inches of drainage gravel in the bottom, then the sock-wrapped 4-inch pipe.", detail: "Pipe holes face down or sideways; cover with more gravel to within 6 inches of grade." },
      { action: "Top off with drainage sand to within 1 inch of grade.", detail: "Sand caps the gravel and supports the sod." },
      { action: "Re-lay sod, tamp/roll flush, and topdress the seam.", detail: "Walk the trench — no soft spots." },
      { action: "Daylight the outlet end and protect with grate or rock apron.", detail: "An outlet that gets clogged is the same as no drain at all." },
    ],
    follow_up: [
      "Walk the new drain after the next two rain events; flow should be visible at the outlet.",
      "Re-tamp settled spots and re-topdress the seam at 2 weeks.",
    ],
    monitor: "Surface should drain in under 2 hours after a 1-inch rain. If not, the slope is wrong or the sock is blinded.",
  },

  bunker_issue: {
    title: "Bunker Edge & Sand Restoration",
    best_window: "Dry sand; 60°F+ helps the lip-cutting tool work cleanly",
    tools_needed: [
      "Bunker rake",
      "Spade and edging tool",
      "Wheelbarrows of fresh bunker sand",
      "Tamper",
      "Square shovel for moving washed sand back into place",
      "Mason's twine and stakes for re-establishing the lip line",
    ],
    crew: "2–3 crew members per bunker",
    duration: "1–2 hours per bunker",
    steps: [
      { action: "Photograph the bunker before any work — record the original shape.", detail: "Prevents 'creeping' bunker boundaries over years of edge work." },
      { action: "Remove all contaminated sand from the floor.", detail: "Clay, silt, and organic matter under the surface ruin drainage." },
      { action: "Probe for the bunker drain inlet at the low point and clear it.", detail: "Standing water after rain = blocked drain in 9 of 10 cases." },
      { action: "Re-cut the lip line back to the original stake-and-string.", detail: "Sharp, vertical or slightly under-cut lip — looks crisp and resists wash." },
      { action: "Push washed-up sand back from the lip down into the bunker floor.", detail: "Use the square shovel; rake smooth as you go." },
      { action: "Add fresh sand to bring depth to 4 inches on the floor and 2 inches on faces.", detail: "Tape-measure the depth — eyeballs underestimate every time." },
      { action: "Tamp the faces gently to set the new sand.", detail: "Loose face sand washes out the next storm." },
      { action: "Final-rake in a consistent pattern — typically toward the center.", detail: "Looks finished and gives the player a fair lie." },
    ],
    follow_up: [
      "Walk after the next rain — check for new washouts at the edge.",
      "Re-rake daily during tournament weeks.",
      "Top up sand depth quarterly with a probe-and-measure pass.",
    ],
    monitor: "Edge should hold its line for a full season; sand depth reading should stay 4-inches on the floor.",
  },

  tree_issue: {
    title: "Tree Care",
    best_window: "Dormant season for major pruning; anytime for hazard limbs",
    tools_needed: [
      "Pole pruner (manual or rented mechanical)",
      "Hand pruners and loppers",
      "Chainsaw (cleared operator) for limbs >2 inches",
      "Safety helmet, glasses, chaps",
      "Tarp and chipper for cleanup",
    ],
    crew: "2 crew members minimum (one ground, one cutting)",
    duration: "1–2 hours per tree",
    steps: [
      { action: "Inspect the tree for hazard rating: dead wood, hangers, splits, lean.", detail: "Anything that could fall on a player or cart goes first." },
      { action: "Remove hangers and dead limbs with the pole pruner from a safe stance.", detail: "Never reach overhead with a chainsaw." },
      { action: "Make 3-cut limb removals on anything heavier than the pole pruner can handle.", detail: "Undercut, top-cut, then flush-cut the stub. Avoids bark tear." },
      { action: "Lift the canopy off the playing corridor — clear sky-line over greens and tees.", detail: "More light & air = healthier turf below." },
      { action: "Chip all small material on-site; cart trunk wood to the firewood pile.", detail: "Don't leave brush piled near the play corridor." },
      { action: "Rake and blow the work zone clean.", detail: "Sticks left behind are mower hazards." },
      { action: "Mark any tree the work shows is structurally compromised for arborist follow-up.", detail: "Major splits, hollow trunks, or 3+ defects = arborist call." },
    ],
    follow_up: [
      "Re-walk after the next storm.",
      "Schedule an arborist visit annually for full-canopy assessment.",
    ],
    monitor: "Healthy regrowth at pruning cuts within a season; no sun-scald on newly exposed bark.",
  },

  irrigation_issue: {
    title: "Irrigation Head Repair (Mechanical)",
    best_window: "When the affected zone is OFF — usually mid-day",
    tools_needed: [
      "Pop-up wrench",
      "Replacement nozzles, screens, and seals",
      "New rotor body or sprayhead in stock",
      "Trenching shovel",
      "Adjustable wrench / channel locks",
      "Marking flags and paint",
    ],
    crew: "1–2 crew members",
    duration: "20–60 min per head",
    steps: [
      { action: "Run the zone manually — observe coverage and identify the failing head.", detail: "Flag every problem head; address them in order from greens out." },
      { action: "If the head is plugged: pull the rotor, remove and clean the screen.", detail: "Most field problems are dirty filters." },
      { action: "If the nozzle pattern is wrong: swap to the correct nozzle for the radius.", detail: "Carry a nozzle kit so this is a 5-min field fix." },
      { action: "If the head leaks at the base: dig down 8 inches, replace the seal or swing-pipe joint.", detail: "Cap the lateral, replace, pressure-test, backfill." },
      { action: "If the rotor body is broken: replace whole-body and re-set arc/radius.", detail: "Tighten by hand only — don't crush the body." },
      { action: "Re-run the zone and verify coverage with a catch-can or visual check.", detail: "Ten cans across a green for proper distribution uniformity (DU)." },
      { action: "Adjust arc and radius to keep water on turf, not paths or play corridors.", detail: "Wasted water is wasted dollars and creates wet/dry patterns." },
    ],
    follow_up: [
      "Re-check the zone weekly for the next 3 weeks — joint failures often follow original failure.",
      "Update the irrigation map with any swapped components.",
    ],
    monitor: "DU above 80% on the next coverage check is the goal.",
  },

  turf_thin: {
    title: "Density Recovery — Aerate, Slit-Seed, Fertilize",
    best_window: "Spring or early fall; soil temp 55–75°F",
    tools_needed: [
      "Slit seeder OR overseeder",
      "Core aerator (3/4-inch tines)",
      "Topdresser",
      "Drag mat or steel mat",
      "LOWMOWBLUES Kentucky Bluegrass Blend (50 lb bag)",
      "Roller",
      "Fertilizer spreader",
    ],
    crew: "2 crew members",
    duration: "Half-day per hole",
    steps: [
      { action: "Mow short the day before to expose the soil surface.", detail: "Better seed-to-soil contact and easier slit-seeder pass." },
      { action: "Core aerate the affected area — 3/4-inch tines on 3-inch spacing.", detail: "Pull plugs; either remove or drag back in once dried." },
      { action: "Slit-seed in two perpendicular passes at half rate each.", detail: "LOWMOWBLUES KBG Blend at 4–5 lbs/1,000 sq ft total; two passes double coverage." },
      { action: "Apply starter fertilizer over the seedbed (see Chemical Applications).", detail: "Phosphorus drives root development on new seedlings." },
      { action: "Drag in plugs / topdress lightly to fill aeration holes and cover seed.", detail: "BGREENPEATB2 Green Sand/Peat Mix at 1/8 to 1/4 inch — peat blend aids germination." },
      { action: "Roll the area with a light roller to firm seed-to-soil contact.", detail: "Skip rolling if soil is wet — only when firm." },
      { action: "Water 3–4 times daily with short cycles for 14 days.", detail: "Don't drown — short cycles, fine mist." },
      { action: "Hold off on mowing until seedlings reach 1.5x bench height.", detail: "First cut should remove no more than 1/3 of the leaf." },
      { action: "Reduce traffic — rope off if possible.", detail: "Cart and foot traffic is the original cause; protect the recovery." },
    ],
    chemicals: [
      {
        product_type: "Starter Fertilizer (high P)",
        product_examples: ["18-24-12 starter", "12-25-12 starter"],
        rate: "1 lb N / 1000 sq ft",
        method: "Granular broadcast at time of seeding; water in immediately",
        timing: "At seeding; second app at 4 weeks; switch to maintenance fert at 8 weeks",
        rei_hours: null,
        precautions: [
          "Sweep granules off cart paths.",
          "Do not exceed label rate — burns seedlings.",
        ],
      },
    ],
    follow_up: [
      "Walk weekly; re-seed any thin lanes after 4 weeks.",
      "Schedule a second core-aeration the following season to lock in the density gain.",
    ],
    monitor: "Density should visibly thicken in 3–4 weeks. Compare photos at start, 2 weeks, 6 weeks.",
  },

  algae: {
    title: "Algaecide Application and Cultural Drying",
    best_window: "Dry mornings — avoid working algae when wet (slippery and spreads spores)",
    tools_needed: [
      "Stiff steel brush or scrub broom",
      "Solid-tine aerator",
      "BGREENPEATB2 Green Sand/Peat Mix",
      "Hose for cleanup",
      "Tank sprayer",
      "Fan if structural shading is removable",
    ],
    crew: "1–2 crew members + spray contractor",
    duration: "30–60 min per affected zone + spray pass",
    steps: [
      { action: "Brush or scrape the algae layer off the surface — into a bucket, off the turf.", detail: "Mechanical removal physically reduces the population." },
      { action: "Solid-tine aerate the area to break up the surface seal.", detail: "Algae thrives where water sits — venting fixes that." },
      { action: "Apply algaecide per label (see Chemical Applications).", detail: "Most products are copper- or sulfate-based and need direct contact." },
      { action: "Topdress with sand to absorb surface moisture and break the algae mat.", detail: "1/8 inch is enough to dry the surface." },
      { action: "Improve airflow: trim back overgrown understory or position a fan if available.", detail: "Algae loves stagnant, humid air at the canopy." },
      { action: "Reduce the run time on this zone by 20% until the surface stays dry between cycles.", detail: "Wet mornings = perfect algae weather; cut the moisture." },
    ],
    chemicals: [
      {
        product_type: "Algaecide / Mossicide",
        product_examples: ["Junction (mancozeb + copper hydroxide)", "TerraCyte Pro (sodium carbonate peroxyhydrate)"],
        rate: "Per label — Junction 4.0 oz/1000 sq ft typical",
        method: "Foliar spray with thorough coverage; second app 7–10 days later",
        timing: "Cool morning, dry foliage, no rain forecast for 4 hrs",
        rei_hours: 24,
        precautions: [
          "Copper products stain pavement, paths, and clothing — keep off cart paths.",
          "Wear chemical-resistant gloves and goggles.",
          "Post REI signs.",
        ],
      },
    ],
    follow_up: [
      "Re-brush in 5 days to knock back regrowth.",
      "Re-vent in 2 weeks.",
      "Photograph the area weekly — algae should retreat in 3–4 weeks of combined work.",
    ],
    monitor: "If algae returns at the same intensity after 4 weeks, structural change (trees, drainage, irrigation timing) is needed.",
  },

  frost_damage: {
    title: "Frost Damage Recovery",
    best_window: "After the frost has fully thawed and turf has dried",
    tools_needed: [
      "Hose for hand-watering",
      "Slit seeder + LOWMOWBLUES Kentucky Bluegrass Blend (50 lb bag) for badly damaged areas",
      "BGREENPEATB2 Green Sand/Peat Mix",
      "Rope and signs for traffic control",
      "Spreader for iron application",
    ],
    crew: "1 crew member",
    duration: "20–30 min per area, plus daily monitoring",
    steps: [
      { action: "Keep ALL traffic off the affected area until the frost is fully thawed and turf has stood up.", detail: "Walking on frosted leaves snaps the cells — that's the worst of frost damage." },
      { action: "Delay first mow on the affected area until the turf has fully recovered color.", detail: "Mowing damaged tissue compounds the damage." },
      { action: "Hand-water lightly only — do not soak.", detail: "Frosted turf can't take up water normally; over-watering rots crowns." },
      { action: "Slit-seed any patches that don't recover in 14 days.", detail: "Some cells are dead; new seedlings replace them." },
      { action: "Apply a foliar iron product for color rebound (see Chemical Applications).", detail: "Iron greens up turf without pushing growth, ideal for stressed tissue." },
      { action: "Topdress lightly to even the surface as turf rebounds.", detail: "1/8 inch sand." },
      { action: "Update the frost-delay protocol with the pro shop — make sure tee times are paused at frost.", detail: "Best fix is preventing the next frost-walking event." },
    ],
    chemicals: [
      {
        product_type: "Foliar Iron / Color Recovery",
        product_examples: ["Ferromec AC (chelated iron)", "Sprint 138 (iron chelate)"],
        rate: "Per label — typically 3–6 oz/1000 sq ft",
        method: "Foliar spray; do not water in for 4 hrs",
        timing: "Cloudy day or evening; air temp 50–80°F",
        rei_hours: 4,
        precautions: [
          "Iron stains concrete, pavers, and clothing — keep off paths.",
          "Wear gloves and eye protection.",
        ],
      },
    ],
    follow_up: [
      "Photograph daily for the first 7 days to track recovery.",
      "Repeat slit-seed pass at week 2 if any patches are still bare.",
    ],
    monitor: "Color should return in 5–10 days; full density in 4–6 weeks for severe damage.",
  },

  other: {
    title: "General Course Repair",
    best_window: "As conditions allow",
    tools_needed: [
      "Hand tools as appropriate",
      "Sand and seed for any turf gap",
      "Cleanup gear",
    ],
    crew: "1–2 crew members",
    duration: "Varies",
    steps: [
      { action: "Document the issue with photos and a written description.", detail: "Establishes baseline before any work." },
      { action: "Identify the root cause — traffic, water, equipment, environment.", detail: "Treating a symptom without finding the cause guarantees the issue returns." },
      { action: "Apply the closest matching cultural practice — venting, hand-water, sod patch, debris cleanup, traffic re-route.", detail: "Most issues respond to one of these." },
      { action: "Coordinate any chemical step (fertilizer, herbicide, fungicide, etc.) with the spray contractor and document on the application log.", detail: "Pick the product class based on the diagnosed cause; follow the relevant procedure for that issue type." },
      { action: "Mark the area and schedule a follow-up walk in 1 week.", detail: "Fix-and-forget is how small issues become big ones." },
      { action: "Photograph progress weekly until resolved.", detail: "Clear before/after for the maintenance log." },
    ],
    follow_up: [
      "Set a calendar reminder to re-inspect at 1, 2, and 4 weeks.",
    ],
    monitor: "Track recovery with photos; if no progress in 2 weeks, escalate.",
  },
};

// ── GREEN procedures (more delicate, smaller equipment) ────────────────────

export const greenFixProcedures: Record<GreenIssueType, ActionPlanProcedure> = {
  fungus_disease: {
    title: "Greens Fungicide Program + Cultural Disease Suppression",
    best_window: "Sunrise dew-removal window every morning until recovery",
    tools_needed: [
      "Whipping pole or rope-and-cane",
      "Backpack blower (low-speed) for canopy drying",
      "Walk-behind greens mower with freshly sharpened reels",
      "Hose with syringe nozzle for spot hand-watering",
      "Roller for mow-replacement days",
      "Tank sprayer or contracted greens spray rig",
    ],
    crew: "1 crew member walking each morning + spray contractor",
    duration: "10–15 min per affected green daily; 30 min spray pass per green",
    steps: [
      { action: "Whip / pole-drag every green at sunrise to remove dew before the sun bakes spores.", detail: "Single biggest disease control on greens." },
      { action: "Identify the specific disease before treating.", detail: "Dollar spot, brown patch, pythium, anthracnose — different curatives." },
      { action: "Raise the bench cut by 1 notch on the affected greens.", detail: "Less stress = better disease tolerance." },
      { action: "Substitute one of the morning cuts with a roll on the affected green.", detail: "Reduces leaf-tip wounds and slows disease spread." },
      { action: "Sharpen the walk mower's reel before every cut on disease-affected greens.", detail: "Clean cut heals overnight; ragged cut invites infection." },
      { action: "Switch irrigation to a single deep early-morning cycle (4–5 a.m.).", detail: "No evening water; minimize leaf-wet hours." },
      { action: "Apply the labeled greens-grade fungicide per label (see Chemical Applications).", detail: "Coordinate with spray contractor — greens require greens-labeled products." },
      { action: "Open canopy: prune low limbs and underbrush blocking morning sun on the green.", detail: "Faster drying = less disease pressure." },
    ],
    chemicals: [
      {
        product_type: "Greens-labeled Curative Fungicide",
        product_examples: ["Daconil Action (chlorothalonil + acibenzolar)", "Heritage Action", "Banner Maxx II (propiconazole)", "Secure (fluazinam)"],
        rate: "Per label — verify product is labeled for putting greens",
        method: "Foliar spray — 2 gal water/1000 sq ft on greens; thorough coverage",
        timing: "Apply at first sign of disease; rotate FRAC group every 14 days to prevent resistance",
        rei_hours: 12,
        precautions: [
          "Greens require greens-labeled products only — do not substitute fairway products.",
          "Wear chemical-resistant gloves, long sleeves, eye protection.",
          "Post REI signs at all entry points to the green.",
          "Calibrate sprayer; greens are small and over-application is easy.",
        ],
      },
    ],
    follow_up: [
      "Photograph the affected green daily for 10 days.",
      "Schedule a preventive fungicide rotation if disease recurs.",
    ],
    monitor: "Patches should stop expanding within 5 days of fungicide + cultural work.",
  },

  dry_spot: {
    title: "Hand-Water + Wetting Agent on Greens LDS",
    best_window: "Sunrise or sunset; never during peak heat",
    tools_needed: [
      "Hose with shower-head wand",
      "Soil probe",
      "Bucket and waterer for remote spots",
      "Pencil aerator or hand fork",
      "Tank sprayer for wetting agent",
    ],
    crew: "1 crew member",
    duration: "20 min per dry spot + monthly wetting agent pass",
    steps: [
      { action: "Probe the spot — top 4 inches dry, hydrophobic = LDS (localized dry spot).", detail: "If probe pulls dust, it's hydrophobic." },
      { action: "Hand-fork or pencil-tine the spot on 2-inch spacing.", detail: "Opens the surface seal so water enters the rootzone instead of running off." },
      { action: "Syringe-water in 3 short passes, 5 min apart.", detail: "Total ~3 min on/off — soaking, not flooding." },
      { action: "Apply greens-labeled wetting agent on a 28-day cycle (see Chemical Applications).", detail: "Drench application; water in within 1 hr." },
      { action: "Re-probe — soil should now pull as a moist core.", detail: "If still dry, vent and water again." },
      { action: "Mark the spot with a small flag for daily morning hand-water.", detail: "LDS spots come back fast; visible reminder helps." },
      { action: "Verify nearby irrigation heads are correct nozzle and arc.", detail: "If the head is short, replace nozzle." },
    ],
    chemicals: [
      {
        product_type: "Greens-grade Soil Surfactant / Wetting Agent",
        product_examples: ["Revolution", "Cascade Plus", "Aqueduct"],
        rate: "Per label — typically 6 oz/1000 sq ft monthly; 12 oz curative",
        method: "Spray + immediate water-in (1/4 inch irrigation)",
        timing: "Apply early morning; reapply every 28 days through stress season",
        rei_hours: 4,
        precautions: [
          "Greens-labeled product only.",
          "Water in within 1 hr to prevent surface film.",
          "Keep off cart paths and bunkers.",
        ],
      },
    ],
    follow_up: [
      "Hand-water daily for 7 mornings.",
      "Re-vent every 2 weeks.",
      "Add a hose-bib reminder card on the cart for that green.",
    ],
    monitor: "Color back to normal in 5–10 days. Persistent LDS = irrigation coverage gap that needs full-zone audit.",
  },

  wet_area: {
    title: "Vent + Surface-Drain a Wet Area on Green",
    best_window: "After the wet zone has dried enough to walk on",
    tools_needed: [
      "Solid-tine pencil aerator (1/4-inch tines)",
      "Sand topdresser",
      "Drag mat",
      "Hand spade for surface drain",
      "Coarse drainage sand",
    ],
    crew: "2 crew members",
    duration: "1 hour per wet zone",
    steps: [
      { action: "Mark the lowest point and the flow direction with paint.", detail: "That's where the drain or surface notch goes." },
      { action: "Solid-tine pencil-vent the area on 3-inch spacing, 4 inches deep.", detail: "Greens-friendly — no plug pulled, no surface scarring." },
      { action: "Top-dress 1/8 inch of dry sand and drag in.", detail: "Surface sand wicks moisture away, firms footing, refines true ball roll." },
      { action: "If chronic: cut a thin sod-strip surface drain down to the nearest collar.", detail: "Lift sod, dig a 4-inch-wide x 4-inch-deep channel, fill with drainage sand to within 1 inch of grade, replace sod." },
      { action: "Reduce the green's irrigation cycle by 20–30% until firmness returns.", detail: "Hand-controller or central system holds the change." },
      { action: "Walk the green at 4 hrs after the next rain — no boot prints holding water.", detail: "If still wet, repeat vent + topdress." },
    ],
    follow_up: [
      "Re-vent every 2 weeks until the green firms up.",
      "Permanent slit-drain if conditions persist after a full season.",
    ],
    monitor: "Surface should drain in under 2 hours after a 1-inch rain.",
  },

  bare_spot: {
    title: "Bare Spot Plug or Seed Repair on Green",
    best_window: "Cool, calm morning; soil temp 55°F+",
    tools_needed: [
      "Cup cutter for plug repair (matched to nursery cup cutter)",
      "PUREFORMANCE Creeping Bentgrass Seed + BGREENPEATB2 mix (sand-and-seed bottle)",
      "Drag mat",
      "Roller",
      "Hand fork",
      "Pin to mark the patched area",
      "Starter fertilizer",
    ],
    crew: "1 crew member",
    duration: "10–20 min per spot",
    steps: [
      { action: "Inspect: small (under 4-inch dia) → sand+seed; larger → plug from nursery green.", detail: "Plugs heal seamlessly; seed leaves a transition for 2 weeks." },
      { action: "If plug repair: cup-cut a fresh donor plug from the nursery green.", detail: "Same depth as the cup cutter on the affected green for flush fit." },
      { action: "Cup-cut and remove the bare-spot plug; drop the donor in.", detail: "Tamp the donor flush — no lip." },
      { action: "If sand+seed: scrape the bare spot to clean soil, broadcast at 1.5x rate.", detail: "PUREFORMANCE Creeping Bentgrass — Crystal Bluelinks, PennLinks & PureSelect blend." },
      { action: "Apply starter fertilizer to the patch (see Chemical Applications).", detail: "Drives root development on plug or seedlings." },
      { action: "Apply BGREENPEATB2 mix at 1/8-inch over the seed; drag and roll lightly.", detail: "Peat/sand blend retains moisture on fast-draining greens — better germination than straight sand." },
      { action: "Place a marker pin at the patch for the morning hand-watering crew.", detail: "Don't lose the patch in normal mowing." },
      { action: "Hand-mist 3–4x daily for 14 days.", detail: "Greens dry fast — short, frequent cycles." },
    ],
    chemicals: [
      {
        product_type: "Starter Fertilizer (greens-grade, high P)",
        product_examples: ["18-24-12 starter", "Nature Safe 8-3-5 starter (organic)"],
        rate: "0.5 lb N / 1000 sq ft on the patch only",
        method: "Light granular broadcast; water in immediately",
        timing: "At time of plug/seed; second app at 4 weeks",
        rei_hours: null,
        precautions: [
          "Don't burn freshly cut plug edges — keep granules off the freshly cut surface.",
          "Water in within 30 min.",
        ],
      },
    ],
    follow_up: [
      "Skip the patched spot on the first 2 mowings (mark with a small flag).",
      "Topdress lightly again at week 2 to smooth.",
    ],
    monitor: "Plug heals in 7–14 days; seed in 4–6 weeks. Photo each week.",
  },

  weed_pressure: {
    title: "Selective Greens Herbicide + Hand-Pull Suppression",
    best_window: "Pre-emergent: spring soil temp 50–55°F. Hand-pull anytime. Post-emergent: cool morning, weeds growing.",
    tools_needed: [
      "Long thin weeding blade (Poa knife or razor)",
      "Bucket",
      "Sand-and-seed bottle for the divots left behind",
      "Drag mat",
      "Tank sprayer for greens-labeled herbicide",
    ],
    crew: "1–2 crew members + spray contractor",
    duration: "30–60 min per green for moderate Poa + spray pass",
    steps: [
      { action: "Walk the green slowly — flag every weed cluster (often Poa annua) with a tee.", detail: "Mark before pulling so you don't miss any." },
      { action: "Slide the Poa knife in beside each plant and lever it out with the root.", detail: "Bag and remove off the green — never leave on the surface." },
      { action: "Sand-and-seed every divot left behind with the matching cultivar.", detail: "Don't leave bare spots — they invite the next weed seed." },
      { action: "Apply greens-labeled pre-emergent herbicide in early spring (see Chemical Applications).", detail: "Stops weed seed germination before the season starts." },
      { action: "For active Poa or other selective targets: apply greens-labeled post-emergent per label.", detail: "Coordinate with spray contractor; document on application log." },
      { action: "Drag the green lightly to smooth the seam and integrate the sand.", detail: "Mat or coco brush works well." },
      { action: "Mow tight and cleanly the next morning — sharp reels matter most when surface is patchy.", detail: "Bench-set, back-lap, fresh edges." },
    ],
    chemicals: [
      {
        product_type: "Greens Pre-emergent Herbicide",
        product_examples: ["Specticle FLO (indaziflam, greens-labeled at low rate)", "Ronstar G (oxadiazon, greens-labeled)"],
        rate: "Per label — verify greens-labeling and rate",
        method: "Spray or granular per product",
        timing: "Spring app at soil temp 50–55°F; fall app for Poa annua control",
        rei_hours: 12,
        precautions: [
          "Greens-labeled products only — most pre-emergents are NOT safe on greens.",
          "Do not apply to areas being seeded that season.",
          "Wear gloves, long sleeves; sweep granules off paths.",
        ],
      },
      {
        product_type: "Greens Selective Post-emergent (if applicable)",
        product_examples: ["Tenacity (mesotrione, where labeled)", "PoaCure (where regionally available)"],
        rate: "Per label — verify greens-labeling",
        method: "Foliar spray; thorough coverage of the target weed",
        timing: "60–80°F; weeds actively growing; no rain forecast for 4 hrs",
        rei_hours: 12,
        precautions: [
          "Some greens herbicides cause temporary whitening of desirable bentgrass — confirm timing with spray contractor.",
          "Drift control essential — avoid spraying near collar/approach.",
          "Wear chemical-resistant gloves and goggles.",
        ],
      },
    ],
    follow_up: [
      "Photograph density weekly; plan a slit-seed of the desired cultivar at end of next aeration.",
      "Re-pull rebounds every 7–14 days.",
    ],
    monitor: "Active weeds yellow within 5 days of post-emergent and die back within 14 days.",
  },

  pest_damage: {
    title: "Greens Insecticide + Mechanical Recovery",
    best_window: "Cool morning; after the active feeding has slowed",
    tools_needed: [
      "Hose + bucket for soap-flush detection",
      "Cup-cutter and donor plugs",
      "PUREFORMANCE Creeping Bentgrass + BGREENPEATB2 mix (sand-and-seed bottle)",
      "Drag mat",
      "Sharp pencil-tine aerator",
      "Tank sprayer / spreader",
    ],
    crew: "1–2 crew members + spray contractor",
    duration: "30–60 min + spray pass",
    steps: [
      { action: "Soap-flush a 1-sq-ft patch to confirm pest type (cutworms, armyworms, etc.).", detail: "2 tbsp dish soap in 2 gal water." },
      { action: "Hand-pick exposed insects after the flush.", detail: "Reduces population mechanically." },
      { action: "Apply greens-labeled insecticide for the identified pest (see Chemical Applications).", detail: "Coordinate with spray contractor; greens-only products." },
      { action: "Pencil-tine over the damage to break up surface seal.", detail: "Helps recovery and improves any later watering." },
      { action: "Plug-repair larger gouges with cup-cut donors from the nursery green.", detail: "Greenside repair so smoothness matches." },
      { action: "Sand-and-seed any minor surface scuffs; drag in.", detail: "Match the cultivar." },
      { action: "Switch to deep, infrequent watering for the next 10 days.", detail: "Strengthens roots so the green tolerates the next outbreak better." },
    ],
    chemicals: [
      {
        product_type: "Greens-labeled Insecticide",
        product_examples: ["Acelepryn (chlorantraniliprole)", "Provaunt (indoxacarb)"],
        rate: "Per label — verify greens-labeling",
        method: "Foliar spray; water-in lightly per label",
        timing: "Late afternoon / early evening; avoid mid-day heat",
        rei_hours: 4,
        precautions: [
          "Wear gloves, long sleeves; avoid skin contact.",
          "Pollinator awareness — spray after sundown to protect bees.",
          "Post REI signs.",
        ],
      },
    ],
    follow_up: [
      "Re-flush in 7 days to measure population.",
      "Rotate mode of action if pest persists.",
    ],
    monitor: "Surface heals in 2–4 weeks. Animal digging should stop within 5 days of population reduction.",
  },

  // ── GRUB DAMAGE on greens — bare spot only, NO chemicals (per superintendent direction) ──
  grub_damage: {
    title: "Grub-Damage Bare Spot Repair on Green (No Chemicals)",
    best_window: "After active feeding has stopped — late fall or after pupation",
    tools_needed: [
      "Sharp spade",
      "Cup cutter for plug repair",
      "Donor plugs from the nursery green",
      "PUREFORMANCE Creeping Bentgrass + BGREENPEATB2 mix (sand-and-seed bottle)",
      "Drag mat",
      "Roller",
    ],
    crew: "1–2 crew members",
    duration: "30–60 min per green",
    steps: [
      { action: "Cut out the dead, grub-killed turf with the cup cutter or sharp spade.", detail: "Take it down to clean soil — no chewed-up roots left in the patch." },
      { action: "Loosen and re-firm the exposed soil under the patch.", detail: "Voids in the rootzone need re-compacting before re-laying turf." },
      { action: "Plug-repair the patch with cup-cut donors from the nursery green.", detail: "Cup-cutter for clean, flush fit; preferred for greens." },
      { action: "Sand-and-seed any smaller scuffs around the main patch.", detail: "PUREFORMANCE Creeping Bentgrass; BGREENPEATB2 mix at 1/8 inch — topdress and drag in." },
      { action: "Roll the green lightly to flatten the seams.", detail: "Smooth ball roll = playable in days." },
      { action: "Hand-mist water 3–4x daily for 14 days.", detail: "Short cycles — greens dry fast." },
      { action: "Mark the patch with a small flag so the morning crew checks daily.", detail: "Don't lose the patch in normal mowing." },
    ],
    follow_up: [
      "Skip the patch on the first 2 mowings (flag it).",
      "Topdress lightly again at week 2 to smooth any settling.",
    ],
    monitor: "Plug seams heal in 7–14 days; sand+seed in 4–6 weeks.",
  },

  mechanical_damage: {
    title: "Mower / Equipment Damage Repair on Green",
    best_window: "Same day as damage if possible",
    tools_needed: [
      "Cup cutter for plug repair",
      "Donor plugs from the nursery green",
      "PUREFORMANCE Creeping Bentgrass + BGREENPEATB2 mix (sand-and-seed bottle)",
      "Drag mat",
      "Roller",
      "Bench-setting tool for the offending mower",
    ],
    crew: "1 crew member for repair, 1 mechanic for the mower",
    duration: "20–45 min per repair",
    steps: [
      { action: "Tag out the offending mower immediately.", detail: "Don't keep mowing; you'll keep making the same damage." },
      { action: "Trim ragged edges of the damaged turf with a spade — make a clean rectangle.", detail: "Or cup-cut donor plugs for round patches." },
      { action: "Loosen the exposed soil with a hand fork.", detail: "Compacted strip from a wheel pass needs to be opened." },
      { action: "Plug-repair (preferred for greens) with donor plugs from the nursery green.", detail: "Match depth — flush fit, no lip." },
      { action: "Sand-and-seed any minor scuff; drag and roll.", detail: "Same routine as bare-spot repair." },
      { action: "Hand-water 3–4x daily for 14 days.", detail: "Short cycles, fine mist." },
      { action: "Send the offending mower to the mechanic for bench-set + reel sharpen.", detail: "Document the issue in the equipment log." },
    ],
    follow_up: [
      "Walk daily for 5 days.",
      "Sharpen all reels on the same machine class.",
      "Re-train operator if pattern damage points to driving habit.",
    ],
    monitor: "Plug seams heal in 7–14 days; sand+seed in 4–6 weeks.",
  },

  irrigation_issue: {
    title: "Irrigation Head Repair on Green Approach / Surrounds",
    best_window: "Mid-day with the zone OFF",
    tools_needed: [
      "Pop-up wrench",
      "Replacement nozzles, screens, seals",
      "Backup head assembly",
      "Trenching shovel",
    ],
    crew: "1–2 crew members",
    duration: "30–60 min per head",
    steps: [
      { action: "Manually run the green's zone and identify any short-spraying or stuck heads.", detail: "Flag every problem before turning the zone off." },
      { action: "Pull the rotor and clean the screen.", detail: "Field problems are usually dirty filters." },
      { action: "Swap the nozzle if pattern is wrong.", detail: "Carry a kit; this is a 5-min fix on-site." },
      { action: "Replace the rotor body if the head is broken or leaking at the base.", detail: "Cap, replace, pressure-test, backfill." },
      { action: "Re-run the zone and verify coverage with a catch-can audit (10 cans across the green).", detail: "DU > 80% is the goal." },
      { action: "Adjust arc and radius — keep water on turf, not the bunker face or cart path.", detail: "Wasted water creates wet/dry patterns elsewhere." },
    ],
    follow_up: [
      "Re-check the green's zone after the next manual cycle.",
      "Update the irrigation map with any swapped components.",
    ],
    monitor: "DU > 80% on next coverage check; even color across the green over the next 2 weeks.",
  },

  algae: {
    title: "Greens Algaecide + Cultural Drying",
    best_window: "Dry mornings",
    tools_needed: [
      "Stiff scrub brush or bunker rake on the affected zone",
      "Solid-tine pencil aerator",
      "BGREENPEATB2 Green Sand/Peat Mix",
      "Hose for cleanup",
      "Tank sprayer",
      "Fan or canopy-thinning plan if structural shade",
    ],
    crew: "1–2 crew members + spray contractor",
    duration: "30 min per zone + spray pass",
    steps: [
      { action: "Brush the algae mat off the surface — into a bucket, off the green.", detail: "Mechanical removal cuts the population immediately." },
      { action: "Pencil-tine the area to break the surface seal.", detail: "Algae thrives where water sits — venting fixes that." },
      { action: "Apply greens-labeled algaecide per label (see Chemical Applications).", detail: "Coordinate with spray contractor." },
      { action: "Topdress 1/8 inch dry sand and drag in.", detail: "Sand absorbs surface moisture and breaks the algae mat." },
      { action: "Reduce zone irrigation by 20% until the surface dries between cycles.", detail: "Wet mornings = algae heaven; cut the moisture." },
      { action: "Trim back overhanging branches if structural shade is the cause.", detail: "Long-term answer for chronic shaded-greens algae." },
    ],
    chemicals: [
      {
        product_type: "Greens-labeled Algaecide / Mossicide",
        product_examples: ["TerraCyte Pro (sodium carbonate peroxyhydrate)", "Junction (where greens-labeled)"],
        rate: "Per label — verify greens-labeling",
        method: "Foliar spray with thorough coverage",
        timing: "Cool morning, dry foliage, no rain forecast for 4 hrs",
        rei_hours: 24,
        precautions: [
          "Greens-labeled products only.",
          "Copper products stain — keep off pavement.",
          "Wear chemical-resistant gloves and goggles.",
          "Post REI signs.",
        ],
      },
    ],
    follow_up: [
      "Re-brush in 5 days; re-vent in 2 weeks.",
      "Photograph weekly — the area should retreat over 3–4 weeks.",
    ],
    monitor: "If algae returns at the same intensity after 4 weeks, structural change (trees, drainage, irrigation timing) is required.",
  },

  frost_damage: {
    title: "Frost Damage Recovery on Green",
    best_window: "After full thaw, dry surface",
    tools_needed: [
      "Hose for hand-mist watering",
      "Slit seeder + PUREFORMANCE Creeping Bentgrass Seed (25 lb bucket) for badly damaged areas",
      "BGREENPEATB2 Green Sand/Peat Mix",
      "Rope and signs for traffic control",
      "Spreader for iron application",
    ],
    crew: "1 crew member",
    duration: "20–30 min per area",
    steps: [
      { action: "Confirm the green is thawed all the way down — probe a plug.", detail: "Frosted-cell breakage happens when foot/cart traffic walks frosted leaves." },
      { action: "Delay first mow on the affected greens until full color recovery.", detail: "Mowing damaged tissue compounds the damage." },
      { action: "Hand-mist water lightly only — do not soak.", detail: "Frosted turf can't take up water normally." },
      { action: "Pencil-tine any obviously stiff/dead patches.", detail: "Helps recovery and improves cell-level rebound." },
      { action: "Apply foliar iron for color rebound on the affected greens (see Chemical Applications).", detail: "Iron greens up turf without pushing growth on stressed tissue." },
      { action: "Slit-seed (or sand-and-seed by hand) any patches that don't recover in 14 days.", detail: "Some cells are dead; new seedlings replace them." },
      { action: "Topdress lightly to even the surface as turf rebounds.", detail: "1/8 inch sand." },
      { action: "Update the frost-delay protocol with the pro shop.", detail: "Best fix is preventing the next frost event from compounding." },
    ],
    chemicals: [
      {
        product_type: "Foliar Iron / Color Recovery",
        product_examples: ["Ferromec AC (chelated iron)", "Sprint 138"],
        rate: "Per label — typically 3–6 oz/1000 sq ft",
        method: "Foliar spray; do not water in for 4 hrs",
        timing: "Cloudy day or evening; air temp 50–80°F",
        rei_hours: 4,
        precautions: [
          "Iron stains pavers, concrete, and clothing.",
          "Wear gloves and eye protection.",
        ],
      },
    ],
    follow_up: [
      "Photograph daily for 10 days.",
      "Repeat slit-seed pass at week 2 if any patches are still bare.",
    ],
    monitor: "Color back in 5–10 days; full density 4–6 weeks for severe damage.",
  },

  ball_marks: {
    title: "Ball-Mark Repair Program",
    best_window: "Continuous — every greens-mow morning + during play",
    tools_needed: [
      "Ball-mark repair tool (or thin spike)",
      "PUREFORMANCE Creeping Bentgrass + BGREENPEATB2 mix (sand-and-seed bottle)",
      "Greenside ball-mark repair signage at every tee box",
    ],
    crew: "Greens crew (every morning) + greenkeeper walks (mid-round)",
    duration: "5–10 min per green per day",
    steps: [
      { action: "Walk every green at sunrise and repair every visible ball mark.", detail: "Push tool tips inward toward center — don't pry up." },
      { action: "Tap repaired mark flush with the putter or roller.", detail: "Settled mark heals overnight; lifted mark dies." },
      { action: "For old, sunken brown marks: sand-and-seed (no scarification needed).", detail: "Pinch of PUREFORMANCE seed + BGREENPEATB2 mix; tap flush." },
      { action: "Post ball-mark repair signs / cards at every tee box.", detail: "Ask members to fix their own + one more per round." },
      { action: "Send a greenkeeper to walk greens 2 hrs after first tee on busy days.", detail: "Mid-round repair stops marks from drying brown." },
      { action: "Track mark counts during morning walks.", detail: "Use the data in the weekly maintenance log to drive member education." },
    ],
    follow_up: [
      "Daily.",
      "Tournament weeks: every 2 hrs during play.",
    ],
    monitor: "Mark counts should drop visibly with consistent mid-round repair + signage.",
  },

  scalping: {
    title: "Scalp Recovery on Green",
    best_window: "First mow after the scalp is detected",
    tools_needed: [
      "Bench-setting tool",
      "PUREFORMANCE Creeping Bentgrass + BGREENPEATB2 mix (sand-and-seed bottle)",
      "Drag mat",
      "Roller",
      "Cup cutter and donor plugs for severe scalps",
    ],
    crew: "1 crew member",
    duration: "20–30 min plus mower service",
    steps: [
      { action: "Stop mowing the affected zones — switch to roll-only until repair is done.", detail: "Continued scalping makes the damage worse fast." },
      { action: "Raise the bench cut by 1–2 notches on all greens for the next 5 mows.", detail: "Lets crowns recover their leaf coverage." },
      { action: "Verify the mower's bench height with the gauge — set it on a flat plate.", detail: "Most scalps are out-of-spec mowers, not surface dips." },
      { action: "Sand-and-seed any visibly torn scalp lines.", detail: "BGREENPEATB2 at 1/8 inch, PUREFORMANCE seed broadcast, drag, mist water." },
      { action: "Plug-repair any deep scalp gouges with donor plugs.", detail: "Cup-cut for flush fit." },
      { action: "Identify low spots that the mower keeps catching and topdress to level over the season.", detail: "Light passes 3–4 times a season smooth surface undulations." },
      { action: "Send the offending mower to the mechanic for inspection.", detail: "Bench-set + reel sharpen + frame check." },
    ],
    follow_up: [
      "Resume normal mowing height once recovery is visible.",
      "Topdress lightly at the next maintenance window to smooth the surface.",
    ],
    monitor: "Recovery in 7–14 days; full density 4 weeks. Mower bench-height should be re-checked weekly.",
  },

  compaction: {
    title: "Compaction Relief on Green",
    best_window: "Spring and fall maintenance windows",
    tools_needed: [
      "Core aerator (5/8 or 3/4-inch tines)",
      "Solid-tine deep-tine option for severe compaction (7-inch tines)",
      "Sand topdresser",
      "Drag mat or coco brush",
      "Roller",
      "Sufficient kiln-dried sand for full topdress",
    ],
    crew: "3 crew members",
    duration: "Half-day per green",
    steps: [
      { action: "Schedule outside tournament play — coordinate with the pro shop.", detail: "Greens take 7–14 days to recover; plan accordingly." },
      { action: "Mow short the day before, then water lightly to soften the surface.", detail: "Easier coring, cleaner pulls." },
      { action: "Core-aerate with 5/8-inch tines on 2-inch spacing — 80% surface coverage.", detail: "Pull plugs and remove or drag back in." },
      { action: "If chronic / severe: deep-tine with 7-inch solid tines on 6-inch spacing.", detail: "Penetrates the compaction layer at 4–6 inches deep." },
      { action: "Heavy topdress with kiln-dried sand to fill the holes.", detail: "1/4–3/8 inch over the surface; brush in until holes are full." },
      { action: "Drag and roll to smooth.", detail: "Should restore most of the playable surface within a day." },
      { action: "Restrict cart traffic near the green (signs, ropes, paint).", detail: "The original cause was traffic — protect the recovery." },
    ],
    follow_up: [
      "Light topdress every 2 weeks for 2 months.",
      "Solid-tine vent monthly between full aerations.",
    ],
    monitor: "Infiltration rate should improve noticeably; firmness without surface seal in 4 weeks.",
  },

  thatch_buildup: {
    title: "Verticut & Topdress to Reduce Thatch",
    best_window: "Spring or early fall, dry surface, soil temp 55°F+",
    tools_needed: [
      "Greens verticutter / dethatcher",
      "Sand topdresser",
      "Drag mat or coco brush",
      "Walk-behind mower for cleanup pass",
      "Bagger / vacuum for collected thatch",
    ],
    crew: "3 crew members",
    duration: "Half-day per green",
    steps: [
      { action: "Mow at normal height to expose the canopy.", detail: "Fresh cut helps the verticutter blades reach thatch instead of leaf." },
      { action: "Verticut in two passes at 90° to each other.", detail: "First pass cuts; second pass crosses and lifts more." },
      { action: "Bag/vacuum the loosened thatch — never leave it on the green.", detail: "Composting it on-green creates more thatch." },
      { action: "Heavy topdress with kiln-dried sand to dilute the remaining organic layer.", detail: "1/4 inch is normal; brush in until the surface looks clean." },
      { action: "Drag and roll to integrate sand and smooth the surface.", detail: "Coco brush works better than steel mat for greens." },
      { action: "Walk-behind mow to clip any leaf-tips standing above the new surface.", detail: "Smooth playing surface within a day." },
      { action: "Resume normal mowing the next morning at +1 notch above bench until full recovery.", detail: "Reduces stress on the freshly-thinned canopy." },
    ],
    follow_up: [
      "Light topdress every 2 weeks for 2 months.",
      "Verticut again at the next maintenance window if organic mat is still detectable in core samples.",
    ],
    monitor: "Pull a 3-inch core monthly; the dark organic layer should shrink over 2–3 verticut/topdress cycles.",
  },

  aeration_needed: {
    title: "Core Aeration of Green",
    best_window: "Spring or early fall maintenance window; soil temp 55°F+",
    tools_needed: [
      "Core aerator (5/8 to 3/4-inch tines)",
      "Sand topdresser (kiln-dried)",
      "Drag mat / coco brush",
      "Walk-behind mower",
      "Roller",
      "Plug remover / pull-back rake (optional)",
    ],
    crew: "3 crew members per green",
    duration: "Half-day per green",
    steps: [
      { action: "Coordinate with the pro shop and post 7–14 day recovery window for the green.", detail: "Greens recover faster than fairways but still need protection." },
      { action: "Mow short the day before; water lightly so tines pull cleanly.", detail: "Easier coring, less crown damage." },
      { action: "Core-aerate with 5/8-inch tines on 2-inch spacing.", detail: "Pull plugs and either remove or drag back in." },
      { action: "Heavy topdress with kiln-dried sand to fill holes (1/4 inch).", detail: "Brush in until holes are full." },
      { action: "Drag and roll to smooth and integrate sand.", detail: "Most greens ready for putt within a day." },
      { action: "Hand-water lightly for 3 days to settle sand into holes.", detail: "Avoid heavy water that floats the sand back to the surface." },
      { action: "Resume normal mowing at +1 notch above bench for the first week.", detail: "Lets the punched canopy regrow leaf area." },
    ],
    follow_up: [
      "Light topdress every 2 weeks for 2 months to cap the seam.",
      "Solid-tine vent monthly between aeration windows.",
    ],
    monitor: "Holes should be invisible on a 2-week putt; full smoothness in 3–4 weeks.",
  },

  topdressing_needed: {
    title: "Light Topdress to Smooth Surface",
    best_window: "Every 2 weeks during the growing season; dry surface",
    tools_needed: [
      "Sand topdresser (kiln-dried)",
      "Drag mat or coco brush",
      "Walk-behind mower for cleanup pass",
      "Hose for light water-in",
    ],
    crew: "1–2 crew members",
    duration: "30–45 min per green",
    steps: [
      { action: "Mow at normal height first.", detail: "Sand integrates better into a freshly cut canopy." },
      { action: "Apply 1/8 inch (light dust) of kiln-dried sand.", detail: "Less is more — heavy applications take longer to integrate." },
      { action: "Brush or drag in until you can't see sand on the surface.", detail: "Coco brush is gentlest; steel mat is faster but rougher." },
      { action: "Water lightly to settle the sand into the canopy.", detail: "Just a mist — no soaking." },
      { action: "Verify the green is putt-ready before opening for play.", detail: "Should roll smooth same-day." },
    ],
    follow_up: [
      "Repeat every 2 weeks during peak growth.",
      "Larger 1/4-inch topdress at each aeration window.",
    ],
    monitor: "Surface should stay smooth and firm; thatch readings should hold or shrink over the season.",
  },

  moss: {
    title: "Silvery Moss — Iron Sulfate + Mechanical Removal + Reseed",
    best_window: "Cool, dry morning — moss is easiest to scrape when slightly dry",
    tools_needed: [
      "Stiff brass or steel scrub brush (push-broom style)",
      "Greens groomer or vertical mower (light cut)",
      "Sand topdresser (kiln-dried)",
      "Pencil aerator (1/4-inch tines)",
      "Drag mat or coco brush",
      "Slit-seeder or hand seeder",
      "Matching turfgrass seed (bentgrass or course species)",
      "Hose for water-in after",
      "Hand pruners / pole-saw for canopy lifting at the green",
      "Tank sprayer for iron sulfate / mossicide",
      "Spreader for granular ferrous sulfate (alternative form)",
      "Portable fan (optional)",
    ],
    crew: "2 crew members per green + spray contractor",
    duration: "1–2 hours per green + spray pass",
    steps: [
      { action: "Photograph each moss patch before any work.", detail: "Establishes a baseline for the resolution-history record." },
      { action: "Apply ferrous sulfate (iron sulfate) on the moss patches per label (see Chemical Applications).", detail: "This is the standard chemical kill — moss turns black within 24–48 hrs." },
      { action: "Wait 24–48 hrs for the iron to blacken/desiccate the moss.", detail: "Don't scrub before the chemical has worked — you'll spread live moss." },
      { action: "Groom or light vertical-mow over the now-blackened moss patches.", detail: "Tears the dead moss mat so it can be removed; sets shallow grooves for seed contact later." },
      { action: "Hand-scrub the dead moss with the stiff brush — into a bucket, off the green.", detail: "Mechanical removal of the killed moss prevents re-establishment." },
      { action: "Pencil-tine the patches on 2-inch spacing.", detail: "Breaks the surface seal and improves infiltration where moss thrives in damp conditions." },
      { action: "Topdress lightly with 1/8 inch of dry kiln-dried sand and drag in.", detail: "Surface sand wicks moisture away; moss can't thrive on dry, well-drained surface." },
      { action: "Slit-seed the cleared moss footprint with the green's bentgrass cultivar at 1.5x rate.", detail: "Crowds out new moss before it can re-establish." },
      { action: "Mist water 3–4x daily for 14 days while the seed germinates.", detail: "Short cycles, fine mist — no flooding." },
      { action: "Lift the canopy: prune any limbs blocking morning sun on the green.", detail: "Moss thrives in shade; sun is the long-term cure." },
      { action: "Reduce the green's irrigation by 20% until the surface stays dry between cycles.", detail: "Wet mornings = moss-friendly; cut the moisture budget." },
      { action: "Position a portable fan if available where structural shade can't be removed.", detail: "Stagnant humid air at the canopy is what moss needs to spread." },
    ],
    chemicals: [
      {
        product_type: "Iron Sulfate / Ferrous Sulfate (moss control)",
        product_examples: ["Ferrous sulfate heptahydrate (granular or liquid)", "MossKiller (where available)", "Lilly Miller Moss Out (sulfate of iron, where labeled for greens)"],
        rate: "Liquid: 4–6 oz / 1000 sq ft as a foliar spray. Granular: 3 lb / 1000 sq ft, water in 1/4 inch.",
        method: "Foliar spray on damp foliage for direct contact OR granular broadcast + immediate water-in",
        timing: "Cool morning, 50–75°F, no rain forecast for 4 hrs; repeat every 14 days until moss footprint stops shrinking",
        rei_hours: 4,
        precautions: [
          "Iron stains concrete, pavers, cart paths, golf bags, and clothing — keep off all hard surfaces.",
          "Wear chemical-resistant gloves, long sleeves, eye protection.",
          "Verify the specific product is labeled for putting greens before applying.",
          "Post REI signs at all entry points.",
          "Granular form must be watered in immediately to avoid burn streaks.",
        ],
      },
      {
        product_type: "Greens-labeled Mossicide (alternative)",
        product_examples: ["TerraCyte Pro (sodium carbonate peroxyhydrate)"],
        rate: "Per label — typically 5–8 lb/1000 sq ft granular or 6 oz/1000 sq ft liquid",
        method: "Granular or liquid per product; water in lightly per label",
        timing: "Cool morning, dry foliage going in; product activates on contact",
        rei_hours: 4,
        precautions: [
          "Keep off pavement and water features.",
          "Greens-labeled product only.",
          "Wear gloves and eye protection.",
        ],
      },
    ],
    follow_up: [
      "Re-apply iron sulfate every 14 days until moss footprint stops shrinking.",
      "Re-scrub any rebound patches in 7 days.",
      "Re-pencil-tine and topdress every 2 weeks until the moss footprint stops growing.",
      "Re-slit-seed at week 4 if turf coverage is still thin.",
      "Photograph weekly to document recovery for the resolution-history log.",
    ],
    monitor: "Moss should turn black within 48 hrs of iron app; footprint shrinks 30–50% within 4 weeks of consistent iron + scrubbing + topdressing + reseeding. Full elimination 1–2 growing seasons of combined chemical + cultural pressure.",
  },

  shade_stress: {
    title: "Shade-Stress Recovery on Green",
    best_window: "Late winter (canopy trim) + growing season (cultural work)",
    tools_needed: [
      "Pole pruner / chainsaw (cleared operator)",
      "Cup cutter for plug repair",
      "Donor plugs from nursery green",
      "Sand topdresser",
      "Slit seeder + PUREFORMANCE Creeping Bentgrass Seed (25 lb bucket)",
      "Spreader for iron application",
      "Portable fan (optional)",
    ],
    crew: "2 crew members",
    duration: "Half-day per green",
    steps: [
      { action: "Map the shade hours on the green — measure morning vs afternoon coverage.", detail: "Greens need 4+ hrs direct sun for healthy turf; mark trees blocking morning sun first." },
      { action: "Schedule selective canopy lift — limbs below 20 ft on the south/east of the green.", detail: "Single biggest fix for shade-stressed greens." },
      { action: "Raise the bench cut by 1 notch on shaded greens.", detail: "Less leaf cut = more photosynthesis = better stress tolerance." },
      { action: "Apply foliar iron for color rebound on shaded greens (see Chemical Applications).", detail: "Iron compensates for reduced photosynthesis." },
      { action: "Reduce traffic in the affected areas — re-route foot pattern.", detail: "Cup positions, mowing pattern, walk paths." },
      { action: "Slit-seed thin areas with shade-tolerant cultivar at 1.5x rate.", detail: "Match the green's blend or upgrade to a shade-tolerant cultivar at next renovation." },
      { action: "Position a portable fan in chronic-shade greens (clubhouse-power option).", detail: "Movement + airflow makes a measurable difference." },
      { action: "Hand-water more carefully — shaded greens dry slower and need less.", detail: "Over-watering compounds the disease pressure on shaded greens." },
    ],
    chemicals: [
      {
        product_type: "Foliar Iron / Color Recovery",
        product_examples: ["Ferromec AC (chelated iron)", "Sprint 138"],
        rate: "Per label — typically 3–6 oz/1000 sq ft",
        method: "Foliar spray; do not water in for 4 hrs",
        timing: "Cloudy day or evening; air temp 50–80°F; reapply every 2–3 weeks",
        rei_hours: 4,
        precautions: [
          "Iron stains pavement, pavers, golf bags, and clothing.",
          "Wear gloves and eye protection.",
        ],
      },
    ],
    follow_up: [
      "Re-measure shade hours after canopy lift; should gain 1–2 hours of direct sun.",
      "Re-evaluate the green at the next dormant season for additional pruning.",
    ],
    monitor: "Density should improve over a season once sun hours are above 4 hrs/day. Persistent thinning despite canopy work = consider species change.",
  },

  traffic_wear: {
    title: "Traffic-Wear Recovery & Re-Routing",
    best_window: "Anytime; pair with a cup-position rotation",
    tools_needed: [
      "Cup cutter and donor plugs",
      "PUREFORMANCE Creeping Bentgrass + BGREENPEATB2 mix (sand-and-seed bottle)",
      "Drag mat",
      "Rope, stakes, and paint for traffic redirection",
      "New cup-position chart",
    ],
    crew: "1 crew member",
    duration: "30 min per green",
    steps: [
      { action: "Identify the worn pattern — usually walk-on/walk-off paths and around the cup.", detail: "Photograph to track recovery over time." },
      { action: "Move the cup position to a different quadrant of the green.", detail: "Spreads wear; lets the worn area rest." },
      { action: "Re-route entry/exit with rope, paint, or signage.", detail: "Direct mower and foot traffic to spread across the entire collar." },
      { action: "Plug-repair the worn footprint with donor plugs.", detail: "Fast recovery for tournament-ready greens." },
      { action: "Sand-and-seed any minor scuffs.", detail: "PUREFORMANCE Creeping Bentgrass + BGREENPEATB2 mix at 1/8 inch." },
      { action: "Switch to a wear-tolerant cultivar overseed at the next aeration window.", detail: "PUREFORMANCE Creeping Bentgrass — broad-spectrum disease resistance and quick recovery." },
    ],
    follow_up: [
      "Rotate the cup position daily.",
      "Re-route mowing pattern weekly so wheels track different paths.",
    ],
    monitor: "Wear footprint should heal in 2–4 weeks once traffic is redirected.",
  },

  chemical_burn: {
    title: "Flush & Recover from Chemical Burn",
    best_window: "Same-day if caught early",
    tools_needed: [
      "Hose with shower-head wand",
      "Sand topdresser",
      "Slit seeder + PUREFORMANCE Creeping Bentgrass Seed (25 lb bucket)",
      "Drag mat",
      "Spreader for iron application",
    ],
    crew: "1–2 crew members",
    duration: "30–60 min plus daily monitoring",
    steps: [
      { action: "Flush the green heavily with water — multiple short cycles to leach product through the rootzone.", detail: "Don't drown — short cycles, walking away between each." },
      { action: "Raise the bench cut by 1–2 notches until visible recovery.", detail: "Less stress on damaged tissue." },
      { action: "Topdress the worst-burned zones lightly to stabilize the surface.", detail: "1/8 inch sand." },
      { action: "Apply foliar iron for color recovery on the affected zones (see Chemical Applications).", detail: "Restores green color while damaged tissue recovers." },
      { action: "Slit-seed any patches that don't recover in 14 days.", detail: "Some cells are dead; re-seed to fill." },
      { action: "Document the application that caused the burn — date, product, rate, applicator.", detail: "Required for follow-up training and to avoid repeats." },
    ],
    chemicals: [
      {
        product_type: "Foliar Iron / Color Recovery",
        product_examples: ["Ferromec AC (chelated iron)", "Sprint 138"],
        rate: "Per label — typically 3–6 oz/1000 sq ft",
        method: "Foliar spray; do not water in for 4 hrs",
        timing: "Cloudy day or evening; once burn flushed",
        rei_hours: 4,
        precautions: [
          "Avoid stacking another stress chemical on already-burned tissue.",
          "Iron stains hard surfaces.",
          "Wear gloves and eye protection.",
        ],
      },
    ],
    follow_up: [
      "Photograph daily for 14 days.",
      "Avoid any additional applications on the affected green for 14 days.",
      "Update the application protocol with the spray contractor / co-op.",
    ],
    monitor: "Color back in 7–14 days for mild burns; 4–6 weeks for severe. Document with photos.",
  },

  poor_drainage: {
    title: "Drainage Improvement on Green",
    best_window: "Aeration window; dry surface",
    tools_needed: [
      "Solid-tine deep-tine aerator (7-inch tines)",
      "Slit-drain rental for severe cases",
      "Sand topdresser (kiln-dried)",
      "Drag mat",
      "Tile probe",
    ],
    crew: "2–3 crew members",
    duration: "Half-day per green",
    steps: [
      { action: "Walk during/after rain and mark the worst-draining areas.", detail: "Paint the actual flow path — that's where the work goes." },
      { action: "Probe for any existing internal drains and clear them first.", detail: "Most drainage problems are blocked existing drains." },
      { action: "Deep-tine with 7-inch solid tines on 6-inch spacing across the worst zones.", detail: "Penetrates the perched water table layer." },
      { action: "Topdress heavily with kiln-dried sand and drag in.", detail: "1/4 inch — fills the channels and improves percolation." },
      { action: "If chronic and structural: cut a slit-drain trench down to the nearest existing drain or daylight.", detail: "Lift sod, dig 4-inch wide x 8-inch deep, fill with drainage sand to within 1 inch, replace sod." },
      { action: "Reduce the green's irrigation cycle by 20% until firmness returns.", detail: "Cuts the moisture load while drainage rebuilds." },
    ],
    follow_up: [
      "Re-deep-tine every 2 weeks until rain events drain in under 2 hours.",
      "Schedule a permanent drain installation if the issue persists for a full season.",
    ],
    monitor: "Walk the green 4 hrs after a 1-inch rain — boot prints should not hold standing water.",
  },

  uneven_surface: {
    title: "Topdress to Level Uneven Green Surface",
    best_window: "Growing season; dry surface; pair with verticut",
    tools_needed: [
      "Sand topdresser (kiln-dried)",
      "Drag mat or coco brush",
      "Roller",
      "String line and stakes for measuring grade if severe",
    ],
    crew: "2 crew members",
    duration: "Half-day per green over a season",
    steps: [
      { action: "Identify and mark the low spots with paint or pin flags.", detail: "Visible reminders for repeated light topdress applications." },
      { action: "Apply heavy topdress (1/4 inch) targeted on the low spots only.", detail: "Don't blanket — focused fill is what levels." },
      { action: "Drag and brush to smooth.", detail: "Coco brush integrates without tearing the canopy." },
      { action: "Roll lightly to firm the new surface.", detail: "Firmer surface holds the level instead of squishing back." },
      { action: "Repeat every 2 weeks throughout the growing season.", detail: "Levels gradually — heavy single applications smother the canopy." },
      { action: "If severe undulations: schedule a dedicated re-grade during the off-season.", detail: "Lift sod, re-grade base, replace sod is the long-term fix." },
    ],
    follow_up: [
      "Photograph and string-line monthly to track level.",
      "Annual evaluation at fall maintenance window.",
    ],
    monitor: "Smoothness improves over a season of repeated light topdress; severe dips need off-season re-grade.",
  },

  other: {
    title: "General Green Repair",
    best_window: "As conditions allow",
    tools_needed: [
      "Hand tools as appropriate",
      "Sand+seed for surface gaps",
      "Plug donor + cup cutter for plug repair",
    ],
    crew: "1 crew member",
    duration: "Varies",
    steps: [
      { action: "Document the issue with photos and a written description.", detail: "Establishes baseline before any work." },
      { action: "Identify the root cause — traffic, water, equipment, environment.", detail: "Treating the symptom without finding the cause guarantees the issue returns." },
      { action: "Apply the closest matching cultural practice — pencil-tine vent, hand-water, plug repair, sand+seed, traffic re-route.", detail: "Most green issues respond to one of these." },
      { action: "Coordinate any chemical step (fertilizer, herbicide, fungicide, etc.) with the spray contractor and document on the application log.", detail: "Pick the product class based on diagnosed cause; verify greens-labeling." },
      { action: "Mark the area for the morning crew and schedule a 1-week follow-up.", detail: "Fix-and-forget is how small issues become big ones." },
      { action: "Photograph weekly until resolved.", detail: "Clear before/after for the maintenance log." },
    ],
    follow_up: [
      "Set calendar reminder for 1, 2, and 4 weeks.",
    ],
    monitor: "Track recovery with photos; if no progress in 2 weeks, escalate.",
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Suggested action priority order on the report. */
export const priorityOrder: TaskPriority[] = ["critical", "high", "normal", "low"];

/** Default sort comparator: critical first, then by hole number. */
export function sortByPriorityThenHole<
  T extends { priority: TaskPriority; hole_number: number },
>(a: T, b: T): number {
  const pa = priorityOrder.indexOf(a.priority);
  const pb = priorityOrder.indexOf(b.priority);
  if (pa !== pb) return pa - pb;
  return a.hole_number - b.hole_number;
}
