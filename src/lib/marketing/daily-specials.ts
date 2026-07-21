import { COURSE_NAME } from "@/lib/config/org";

/**
 * Daily-special ideas for the restaurant, one theme per weekday, each with a
 * plain-language rationale ("why this day") drawn from common golf-course and
 * day-of-week traffic patterns. These are starting suggestions to drive walk-in
 * traffic — not guarantees. Validate against real sales once you have it.
 *
 * Monday's Hot Dog Monday is the one already proven at the course; the rest
 * follow the same low-cost, easy-to-run, recognizable-theme playbook.
 */

export interface DailySpecial {
  day: string;
  theme: string;
  tagline: string;
  description: string;
  audience: string;
  rationale: string;
  alternatives: string[];
  proven?: boolean;
}

export const WEEKLY_SPECIALS: DailySpecial[] = [
  {
    day: "Monday",
    theme: "Hot Dog Monday",
    tagline: "$1 dogs to start the week.",
    description: "The house classic — cheap, fast, and already a proven draw. Bundle with a drink for a combo price.",
    audience: "Walk-ins, retirees, weekday leagues, price-driven regulars.",
    rationale: "Monday is one of the slowest golf and dining days; a cheap, recognizable crowd-pleaser you already run fills a dead day. Keep it — it works.",
    alternatives: ["Meatloaf Monday plate special", "Buy-one-get-one appetizers"],
    proven: true,
  },
  {
    day: "Tuesday",
    theme: "Taco Tuesday",
    tagline: "Build-your-own tacos, all day.",
    description: "Two- or three-taco plates with a rotating protein, plus a drink pairing. Low food cost, high margin.",
    audience: "After-work crowd, families, groups.",
    rationale: "A nationally recognized promo people already look for — no education needed. Cheap proteins and shared prep keep food cost low on an otherwise quiet day.",
    alternatives: ["Two-for-one tacos 4–6pm", "Taco + margarita combo"],
  },
  {
    day: "Wednesday",
    theme: "Wing Wednesday",
    tagline: "Wings by the dozen for league night.",
    description: "Wing baskets and pitchers timed to the Wednesday league. Run a per-dozen price and a pitcher pairing.",
    audience: "Wednesday league players and their guests.",
    rationale: "Wednesday is a league day — the players are already here. Shareable food + pitchers captures them after the round instead of losing them on the drive home.",
    alternatives: ["Margarita Wednesday", "Burger & beer league special"],
  },
  {
    day: "Thursday",
    theme: "Thirsty Thursday",
    tagline: "Drink specials for the commanders league.",
    description: "Discounted drafts, well drinks, or a signature cocktail during and after the Thursday league.",
    audience: "Thursday commanders league, social/after-work drinkers.",
    rationale: "The second league night of the week. A drink-led promo lifts the highest-margin category when a social crowd is already on site.",
    alternatives: ["Thursday steak night", "Half-price appetizers 4–6pm"],
  },
  {
    day: "Friday",
    theme: "Fish Fry Friday",
    tagline: "Fresh fish fry to kick off the weekend.",
    description: "Classic fried or baked fish plate with sides. Consider a veterans/senior appreciation price point.",
    audience: "Older and veteran community, weekend kickoff crowd, families.",
    rationale: "A Friday fish fry is a strong regional tradition that draws the older and veteran community — a natural fit for Veterans Memorial — and starts the weekend on your busiest stretch.",
    alternatives: ["Prime rib Friday", "Weekend kickoff happy hour"],
  },
  {
    day: "Saturday",
    theme: "Weekend Burger Bar",
    tagline: "Loaded burgers for the busiest day.",
    description: "A signature burger with build-your-own toppings, paired with a beer or shake. Fast to run at volume.",
    audience: "Morning and midday golfers, walk-ins.",
    rationale: "Saturday is your busiest golf day — lead with a high-volume, high-margin, fast-ticket item that turns tables quickly at the peak.",
    alternatives: ["Saturday breakfast/brunch until 11", "BBQ platter special"],
  },
  {
    day: "Sunday",
    theme: "Sunday Funday",
    tagline: "Family plates and brunch to close the week.",
    description: "A family-friendly plate or brunch with a kids-eat-free angle and a Sunday drink special.",
    audience: "Families, casual weekend players winding down.",
    rationale: "Sunday skews family and casual. A kids-eat-free or brunch angle brings the whole group and keeps them on site after the round.",
    alternatives: ["Bloody Mary / mimosa brunch bar", "Kids-eat-free with an adult entrée"],
  },
];

/** Look up a day's special (case-insensitive), or null. */
export function specialForDay(day: string): DailySpecial | null {
  const needle = day.trim().toLowerCase();
  return WEEKLY_SPECIALS.find((s) => s.day.toLowerCase() === needle) ?? null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

/**
 * Build a self-contained, printable one-page flyer for a special. Deterministic
 * and dependency-free so it can open straight into a print window.
 */
export function buildSpecialFlyerHtml(special: DailySpecial, courseName = COURSE_NAME): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(special.theme)} — flyer</title>
<style>
  html, body { margin: 0; }
  body { font-family: "Arial Black", Arial, Helvetica, sans-serif; color: #10241c; }
  .flyer { width: 100%; min-height: 100vh; box-sizing: border-box; padding: 8vh 8vw;
    display: flex; flex-direction: column; justify-content: center; text-align: center;
    background: linear-gradient(160deg, #f6fbf7, #e3f0e6); }
  .day { font-size: 20px; letter-spacing: 4px; text-transform: uppercase; color: #2f6b4f; }
  .theme { font-size: 68px; line-height: 1.02; margin: 12px 0; text-transform: uppercase; }
  .tagline { font-size: 30px; font-weight: 700; color: #2f6b4f; margin-bottom: 28px; }
  .desc { font-size: 20px; font-weight: 400; font-family: Arial, sans-serif; max-width: 620px;
    margin: 0 auto 36px; line-height: 1.5; }
  .course { font-size: 22px; font-weight: 700; border-top: 3px solid #2f6b4f; padding-top: 18px; }
  @media print { .flyer { min-height: auto; height: 100vh; } }
</style></head>
<body><div class="flyer">
  <div class="day">${escapeHtml(special.day)}</div>
  <div class="theme">${escapeHtml(special.theme)}</div>
  <div class="tagline">${escapeHtml(special.tagline)}</div>
  <div class="desc">${escapeHtml(special.description)}</div>
  <div class="course">${escapeHtml(courseName)}</div>
</div></body></html>`;
}
