import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// One-time seed route to add initial course walk-through observations
// POST /api/seed-observations

const OBSERVATIONS = [
  {
    title: "Overall curb appeal is dull — needs to Wow and feel prestigious",
    description:
      "When I pulled up, the place looked dull. I want it to Wow me and feel prestigious. The first impression needs major improvement to set the tone for the entire experience.\n\nRECOMMENDED FIX:\n1. Power wash all walkways, curbs, and entrance areas\n2. Add fresh mulch to all landscape beds around the clubhouse and entrance\n3. Plant seasonal color beds (annuals) at the entrance — petunias, marigolds, or impatiens for summer pop\n4. Install landscape lighting along the entrance drive for an upscale evening look\n5. Add a professionally designed welcome sign with the course logo at the main entrance\n6. Keep the grass along the entrance drive mowed tight and edged weekly\n7. Consider a flagpole with the course flag near the entrance for a prestigious touch",
    category: "aesthetics",
    sentiment: "negative",
    location: "Entrance / Front",
    hole_number: null,
    tags: ["first-impression", "curb-appeal", "priority"],
  },
  {
    title: "Parking lot needs redone",
    description:
      "The parking lot is in poor condition and needs to be redone. This is one of the first things guests see when they arrive.\n\nRECOMMENDED FIX:\n1. Get 2-3 quotes from local paving contractors for full resurface or overlay\n2. In the short term, fill potholes with cold patch asphalt and seal cracks\n3. Re-stripe all parking spaces, handicap spots, and fire lanes with fresh paint\n4. Add clear directional signage (entrance, exit, cart staging, bag drop)\n5. Install wheel stops or curbing where cars meet landscaped areas\n6. Add a designated bag drop area with signage near the pro shop entrance\n7. Consider adding a cart path from the lot to the clubhouse if one doesn't exist\n8. Budget estimate: $15,000-$40,000 for full resurface depending on size",
    category: "infrastructure",
    sentiment: "negative",
    location: "Parking lot",
    hole_number: null,
    tags: ["parking", "first-impression", "infrastructure"],
  },
  {
    title: "Signs and poles need repainted",
    description:
      "Signs and poles throughout the property need to be repainted. They look worn and detract from the overall appearance of the course.\n\nRECOMMENDED FIX:\n1. Inventory all signs and poles across the property — assign crew to photograph and catalog each one\n2. Sand, prime, and repaint all metal poles with rust-resistant exterior paint (glossy black or dark green for a classic look)\n3. Repaint or replace all directional and informational signs with a consistent design theme\n4. Use a unified color scheme that matches the course branding (e.g., dark green with gold/white lettering)\n5. Replace any signs that are too damaged to paint — get quotes from a local sign shop\n6. Schedule annual touch-up painting each spring as part of opening day prep\n7. Estimated cost: $500-$1,500 in paint/supplies if done in-house by crew",
    category: "aesthetics",
    sentiment: "negative",
    location: "Throughout course",
    hole_number: null,
    tags: ["signage", "paint", "aesthetics"],
  },
  {
    title: "Course closes at 5:30 — too early",
    description:
      "The course closes at 5:30 PM which is way too early. Need to extend operating hours to allow more play and revenue, especially during longer daylight months.\n\nRECOMMENDED FIX:\n1. Extend closing time to sunset or dusk (approximately 8:00-8:30 PM in summer months)\n2. Implement seasonal hours: Spring/Summer close at 8:00 PM, Fall close at 6:30 PM, Winter close at 5:00 PM\n3. Offer twilight rates starting 3-4 hours before close to attract evening players and increase revenue\n4. Adjust crew schedules — stagger start times so a closing crew handles evening maintenance\n5. Set a firm \"last tee time\" policy (e.g., 2 hours before close for 18 holes, 1 hour for 9)\n6. Add lighting to the practice green and driving range area to extend use after course close\n7. Post new hours prominently on the website, Google listing, entrance sign, and pro shop\n8. Revenue impact: even 5-10 extra rounds per day at twilight rates could add $500-$1,000/week",
    category: "processes",
    sentiment: "negative",
    location: "Clubhouse",
    hole_number: null,
    tags: ["hours", "operations", "revenue"],
  },
  {
    title: "Add white picket fence along the road for curb appeal",
    description:
      "We need to add something to draw attention and create a prestigious feel. A white picket fence along the road would significantly improve curb appeal and make the course stand out.\n\nRECOMMENDED PLAN:\n1. Measure the road frontage to determine total linear footage needed\n2. Choose between vinyl (low maintenance, $15-$25/linear ft installed) or wood ($10-$18/linear ft but requires annual painting)\n3. Vinyl is strongly recommended — no painting, no rot, stays white for 20+ years\n4. Install the fence 2-3 feet inside the property line to avoid right-of-way issues\n5. Plant low ornamental grasses or boxwood hedging along the base of the fence for added class\n6. Add the course name and logo on a matching sign panel integrated into the fence line\n7. Get 3 quotes from fencing contractors — look for military/government discount rates\n8. Consider installing in phases if budget is tight (main road frontage first, then expand)\n9. Budget estimate: $5,000-$15,000 depending on frontage length and material",
    category: "aesthetics",
    sentiment: "idea",
    location: "Road frontage",
    hole_number: null,
    tags: ["curb-appeal", "fencing", "first-impression", "idea"],
  },
  {
    title: "Hole signs need repainted — some are coming out of the ground",
    description:
      "Signs for the holes need repainted. Some signs are physically coming out of the ground and need to be reset or replaced entirely.\n\nRECOMMENDED FIX:\n1. Walk all 18 holes and document the condition of every tee sign — note which need paint vs. full replacement\n2. For loose/leaning signs: dig out the post, reset in a new hole with quick-set concrete (60 lb bag per post), plumb level\n3. For repainting: sand surfaces, apply exterior primer, then 2 coats of exterior paint in course brand colors\n4. Repaint hole numbers, yardage, par, and handicap info using stencils for a clean professional look\n5. Consider upgrading to granite or composite tee markers for a premium feel — $200-$400 each\n6. Add small landscape beds (hostas or liriope) around tee sign bases for a polished appearance\n7. Assign 2 crew members for 2-3 days to knock out all 18 holes\n8. Budget: $300-$600 for paint/concrete if done in-house; $4,000-$7,000 if replacing all with premium signs",
    category: "infrastructure",
    sentiment: "negative",
    location: "Throughout course",
    hole_number: null,
    tags: ["signage", "hole-markers", "paint"],
  },
  {
    title: "Yardage stakes are beat up and crooked",
    description:
      "Yardage stakes across the course are getting beat up and are crooked. They need to be straightened, repaired, or replaced to maintain a professional appearance.\n\nRECOMMENDED FIX:\n1. Pull all crooked yardage stakes, straighten or replace damaged ones\n2. Reset each stake plumb and firm — use a rubber mallet to drive them straight, pack soil around the base\n3. Repaint all stakes in standard colors: red = 100 yds, white = 150 yds, blue = 200 yds (or match existing scheme)\n4. Replace any stakes that are cracked, splintered, or beyond repair — fiberglass stakes last longer than wood ($3-$8 each)\n5. Consider upgrading to granite or stone yardage markers set flush in the fairway for a premium look ($50-$100 each)\n6. Add this to the weekly mowing crew checklist: \"check yardage stakes for straightness during mow\"\n7. Budget: $200-$500 for replacement stakes and paint if done in-house\n8. Assign 1-2 crew members for 1 day to reset all stakes across all 18 holes",
    category: "infrastructure",
    sentiment: "negative",
    location: "Throughout course",
    hole_number: null,
    tags: ["yardage-stakes", "markers", "aesthetics"],
  },
  {
    title: "Out of bounds markers are crooked",
    description:
      "Out of bounds markers are crooked throughout the course. They need to be straightened and properly secured.\n\nRECOMMENDED FIX:\n1. Walk the entire course boundary and catalog every OB stake — note which are crooked, missing, or broken\n2. Pull each crooked stake, re-drive straight using a post driver or rubber mallet, pack soil firmly around base\n3. Replace any broken or missing stakes — standard white OB stakes are $2-$5 each\n4. Ensure stakes are spaced consistently (30-50 yards apart on straight lines, closer on curves)\n5. Paint all stakes bright white for visibility — use reflective paint or tape for dawn/dusk play\n6. Check that OB lines comply with local rules and USGA guidelines\n7. Add OB stake inspection to monthly course walk-through checklist\n8. Assign 1-2 crew members for half a day to complete all boundaries\n9. Budget: $100-$300 for replacement stakes and paint",
    category: "infrastructure",
    sentiment: "negative",
    location: "Throughout course",
    hole_number: null,
    tags: ["OB-markers", "markers"],
  },
  {
    title: "Huge geese problem — poop on greens and everywhere",
    description:
      "We have a massive geese problem. Geese poop is all over the place — on the greens, fairways, everywhere. We need to rid the geese. This is a health, aesthetics, and playing condition issue that needs immediate attention.\n\nRECOMMENDED FIX (multi-pronged approach needed):\n1. IMMEDIATE: Deploy border collie or trained goose-herding dog service — this is the #1 most effective deterrent ($300-$800/month for a service)\n2. Install motion-activated sprinklers (Orbit Yard Enforcer, ~$70 each) around greens and high-traffic areas\n3. Apply goose repellent spray (Flight Control Plus or Migrate) to greens, tees, and fairways — EPA approved, won't harm turf ($150-$300 per application)\n4. Place coyote decoys around ponds and open areas — move them every 2-3 days so geese don't get used to them\n5. Install fishing line grid (2-3 ft high) around ponds and water features where geese congregate\n6. Let rough areas near water grow taller (6+ inches) — geese prefer short grass where they can see predators\n7. Use air horns or propane cannons during early morning hours to discourage landing (check noise ordinances)\n8. Contact USDA Wildlife Services about a goose management permit if population is severe\n9. Add goose poop cleanup to daily morning prep routine — crew should blow/wash greens and tees before play\n10. Budget: $2,000-$5,000/year for a comprehensive program; dog service is worth every penny",
    category: "pest_disease",
    sentiment: "negative",
    location: "Entire course",
    hole_number: null,
    tags: ["geese", "wildlife", "sanitation", "urgent", "greens"],
  },
  {
    title: "Huge dirt/mud spots, holes, and deformities on fairways",
    description:
      "There are huge dirt and mud spots on the fairways along with holes and other deformities. The fairway turf conditions are unacceptable and need restoration work.\n\nRECOMMENDED FIX:\n1. IMMEDIATE: Fill all divots and holes with a sand/seed mix (80% sand, 20% Kentucky Bluegrass/Perennial Ryegrass seed blend)\n2. For large bare/mud areas: core aerate the compacted soil, topdress with compost/sand blend, overseed with KBG/PRG at 4-6 lbs per 1,000 sq ft\n3. Address drainage issues — mud spots often indicate poor drainage. Trench drain or French drain may be needed in chronic wet areas\n4. Sod the worst bare spots for instant recovery — use KBG/PRG blend sod, lay tight seams, roll, and water heavily for 2 weeks\n5. Fix any cart path drainage that is directing water onto fairways\n6. Implement cart traffic management — use 90-degree rule or cart-path-only on wet days to prevent further damage\n7. Apply a starter fertilizer (high phosphorus, e.g., 18-24-12) to all repaired areas to promote root establishment\n8. Keep repaired areas roped off or marked with \"Ground Under Repair\" signs until turf establishes\n9. Set up temporary irrigation for seeded areas if not covered by existing system\n10. Timeline: sod repairs show in 2 weeks, seeded areas take 4-6 weeks to fill in\n11. Budget: $1,000-$3,000 for seed, sand, sod, and fertilizer for moderate repairs",
    category: "turf",
    sentiment: "negative",
    location: "Fairways",
    hole_number: null,
    tags: ["fairways", "turf-damage", "mud", "bare-spots", "priority"],
  },
  {
    title: "Greens are in bad shape — bumpy, missing grass, moss growing",
    description:
      "The greens are bad. They are bumpy, have areas of missing grass, and moss is growing on some of them. This is unacceptable for any golf course and needs to be the top priority for turf restoration.\n\nRECOMMENDED FIX:\n1. MOSS REMOVAL (do first): Apply moss killer — ferrous sulfate at 3 oz per 1,000 sq ft or a commercial product like MossOut. Moss turns black in 2-3 days, then dethatch/rake it out\n2. SOIL TEST: Pull soil samples from 4-6 greens and send to a lab (University of Illinois Extension). Moss indicates low pH, poor drainage, or low fertility — the test will confirm what to correct\n3. BUMPY GREENS: Core aerate with 1/2\" hollow tines, topdress heavily with USGA-spec sand, drag/brush sand into holes. Repeat monthly through the growing season\n4. MISSING GRASS: After aeration, overseed bare areas with Creeping Bentgrass (A1, A4, or Pure Distinction varieties) at 1-2 lbs per 1,000 sq ft\n5. TOPDRESSING PROGRAM: Light, frequent topdressing every 2-3 weeks with straight sand to smooth the surface over time — this is the #1 fix for bumpy greens\n6. FERTILITY: Apply a balanced fertilizer program — 0.5 lb N per 1,000 sq ft every 3-4 weeks during growing season using a slow-release granular\n7. ADJUST pH: If soil test shows low pH, apply pelletized lime per lab recommendations to discourage moss return\n8. IMPROVE DRAINAGE: If greens hold water, consider venting with solid tines monthly between aerations\n9. MOWING: Raise cutting height slightly (to 0.140-0.150\") while greens recover, then gradually lower as turf thickens\n10. FUNGICIDE PROGRAM: Start a preventive program — apply broad-spectrum fungicide (Headway G or Banner Maxx) every 21-28 days to protect recovering turf\n11. Timeline: expect 30-60 days for noticeable improvement; full recovery takes a full growing season of consistent care\n12. Budget: $3,000-$8,000 for a season-long greens restoration program (aeration, sand, seed, chemicals, soil tests)",
    category: "turf",
    sentiment: "negative",
    location: "Greens",
    hole_number: null,
    tags: ["greens", "moss", "turf-damage", "bumpy", "urgent", "priority"],
  },
];

export async function POST() {
  try {
    const supabase = await createClient();

    // Verify the user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const results = [];
    const errors = [];

    for (const obs of OBSERVATIONS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("course_observations")
        .insert({
          ...obs,
          zone_id: null,
          photo_ids: null,
          created_by: user.id,
          is_addressed: false,
          linked_plan_item_id: null,
        })
        .select()
        .single();

      if (error) {
        errors.push({ title: obs.title, error: error.message });
      } else {
        results.push({ id: data.id, title: data.title });
      }
    }

    return NextResponse.json({
      success: true,
      inserted: results.length,
      total: OBSERVATIONS.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Seed observations error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
