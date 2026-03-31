import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// One-time seed route to add initial course walk-through observations
// POST /api/seed-observations

const OBSERVATIONS = [
  {
    title: "Overall curb appeal is dull — needs to Wow and feel prestigious",
    description:
      "When I pulled up, the place looked dull. I want it to Wow me and feel prestigious. The first impression needs major improvement to set the tone for the entire experience.",
    category: "aesthetics",
    sentiment: "negative",
    location: "Entrance / Front",
    hole_number: null,
    tags: ["first-impression", "curb-appeal", "priority"],
  },
  {
    title: "Parking lot needs redone",
    description:
      "The parking lot is in poor condition and needs to be redone. This is one of the first things guests see when they arrive.",
    category: "infrastructure",
    sentiment: "negative",
    location: "Parking lot",
    hole_number: null,
    tags: ["parking", "first-impression", "infrastructure"],
  },
  {
    title: "Signs and poles need repainted",
    description:
      "Signs and poles throughout the property need to be repainted. They look worn and detract from the overall appearance of the course.",
    category: "aesthetics",
    sentiment: "negative",
    location: "Throughout course",
    hole_number: null,
    tags: ["signage", "paint", "aesthetics"],
  },
  {
    title: "Course closes at 5:30 — too early",
    description:
      "The course closes at 5:30 PM which is way too early. Need to extend operating hours to allow more play and revenue, especially during longer daylight months.",
    category: "processes",
    sentiment: "negative",
    location: "Clubhouse",
    hole_number: null,
    tags: ["hours", "operations", "revenue"],
  },
  {
    title: "Add white picket fence along the road for curb appeal",
    description:
      "We need to add something to draw attention and create a prestigious feel. A white picket fence along the road would significantly improve curb appeal and make the course stand out.",
    category: "aesthetics",
    sentiment: "idea",
    location: "Road frontage",
    hole_number: null,
    tags: ["curb-appeal", "fencing", "first-impression", "idea"],
  },
  {
    title: "Hole signs need repainted — some are coming out of the ground",
    description:
      "Signs for the holes need repainted. Some signs are physically coming out of the ground and need to be reset or replaced entirely.",
    category: "infrastructure",
    sentiment: "negative",
    location: "Throughout course",
    hole_number: null,
    tags: ["signage", "hole-markers", "paint"],
  },
  {
    title: "Yardage stakes are beat up and crooked",
    description:
      "Yardage stakes across the course are getting beat up and are crooked. They need to be straightened, repaired, or replaced to maintain a professional appearance.",
    category: "infrastructure",
    sentiment: "negative",
    location: "Throughout course",
    hole_number: null,
    tags: ["yardage-stakes", "markers", "aesthetics"],
  },
  {
    title: "Out of bounds markers are crooked",
    description:
      "Out of bounds markers are crooked throughout the course. They need to be straightened and properly secured.",
    category: "infrastructure",
    sentiment: "negative",
    location: "Throughout course",
    hole_number: null,
    tags: ["OB-markers", "markers"],
  },
  {
    title: "Huge geese problem — poop on greens and everywhere",
    description:
      "We have a massive geese problem. Geese poop is all over the place — on the greens, fairways, everywhere. We need to rid the geese. This is a health, aesthetics, and playing condition issue that needs immediate attention.",
    category: "pest_disease",
    sentiment: "negative",
    location: "Entire course",
    hole_number: null,
    tags: ["geese", "wildlife", "sanitation", "urgent", "greens"],
  },
  {
    title: "Huge dirt/mud spots, holes, and deformities on fairways",
    description:
      "There are huge dirt and mud spots on the fairways along with holes and other deformities. The fairway turf conditions are unacceptable and need restoration work.",
    category: "turf",
    sentiment: "negative",
    location: "Fairways",
    hole_number: null,
    tags: ["fairways", "turf-damage", "mud", "bare-spots", "priority"],
  },
  {
    title: "Greens are in bad shape — bumpy, missing grass, moss growing",
    description:
      "The greens are bad. They are bumpy, have areas of missing grass, and moss is growing on some of them. This is unacceptable for any golf course and needs to be the top priority for turf restoration.",
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
