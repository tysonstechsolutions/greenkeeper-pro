/**
 * Auto-prioritization engine for the unified Priority Queue.
 *
 * Combines three item sources into a single ranked list:
 *   1. hole_observations (course issues reported through the app)
 *   2. standards_plan.json entries (FY24 Navy Standards gaps)
 *   3. custom items added ad-hoc via the page (localStorage)
 *
 * Scoring philosophy: course-saving issues (irrigation, thin turf needing
 * seed, drainage, active pest damage) outrank cosmetic and administrative
 * items. Every score is transparent - each item exposes which factors
 * contributed and by how much.
 */

import type {
  DiagnosisResult,
  HoleIssueType,
  HoleObservationStatus,
  TaskPriority,
} from "@/types/database";

// ─────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────

export type ItemSource = "course" | "standards" | "custom";

export type ItemStatus =
  | "open"
  | "in_progress"
  | "monitoring"
  | "blocked"
  | "done";

/** Normalized item passed to the prioritizer regardless of source. */
export interface PriorityInput {
  id: string;                 // globally unique (source-prefixed)
  source: ItemSource;
  title: string;
  description?: string;
  category?: string;          // e.g. "Irrigation", "Turf Recovery"
  rawCategory?: string;       // original key (issue_type, section, etc.)
  hole?: number;              // if course-specific
  reportedAt?: string;        // ISO date for age calculation
  status: ItemStatus;

  // Optional priority hints from the source
  sourcePriority?: TaskPriority | "P1" | "P2" | "P3" | "P4";

  // How to fix it (step-by-step)
  /** Free-text fix instructions (from hole_observations or custom items). */
  fixInstructions?: string;
  /** Structured ordered steps (from standards-plan entries' actions array). */
  fixSteps?: string[];

  // Photos
  /** Primary photo (from course issue). */
  photoUrl?: string;
  /** Additional supporting photos. */
  photos?: string[];
  /** After-fix proof photos (from course issue's resolution_photos). */
  resolutionPhotos?: string[];

  /** Full AI diagnosis + treatment plan blob (course issues only). */
  diagnosisResult?: DiagnosisResult | null;

  // For standards-plan items
  possibleScore?: number;     // points at stake on the standards scoresheet
  effort?: "Low" | "Medium" | "High";
  cost?: number;
  owner?: string;
  dependencies?: string[];

  // Manual overrides
  pinned?: boolean;           // user can pin to top
  manualBump?: number;        // user can add/subtract score
}

export interface ScoredFactor {
  label: string;
  value: number;
}

export interface PrioritizedItem extends PriorityInput {
  score: number;
  tier: "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "DONE";
  factors: ScoredFactor[];
  explanation: string;        // human-readable summary
}

// ─────────────────────────────────────────────────────────────────────────
// Scoring weights
// ─────────────────────────────────────────────────────────────────────────

/** Base weights for hole_observations issue_type. Higher = more urgent. */
const COURSE_ISSUE_WEIGHTS: Record<HoleIssueType, { score: number; category: string }> = {
  irrigation_issue:   { score: 100, category: "Irrigation" },
  drainage:           { score: 95,  category: "Drainage" },
  turf_thin:          { score: 90,  category: "Turf Recovery" },
  bare_spot:          { score: 87,  category: "Turf Recovery" },
  dry_spot:           { score: 85,  category: "Turf Recovery" },
  wet_area:           { score: 85,  category: "Drainage" },
  fungus_disease:     { score: 82,  category: "Disease/Pest" },
  grub_damage:        { score: 80,  category: "Disease/Pest" },
  pest_damage:        { score: 80,  category: "Disease/Pest" },
  algae:              { score: 72,  category: "Greens Quality" },
  felled_tree:        { score: 70,  category: "Safety / Hazard" },
  frost_damage:       { score: 60,  category: "Weather Damage" },
  bunker_issue:       { score: 55,  category: "Bunkers" },
  mechanical_damage:  { score: 55,  category: "Mechanical" },
  tree_issue:         { score: 50,  category: "Trees" },
  weed_pressure:      { score: 45,  category: "Weeds" },
  mulch_pile:         { score: 30,  category: "Debris" },
  sticks_on_ground:   { score: 25,  category: "Debris" },
  sticks_around_tree: { score: 25,  category: "Debris" },
  other:              { score: 40,  category: "Other" },
};

/** Base weights for standards plan items by section. Course-impact > admin. */
const STANDARDS_SECTION_WEIGHTS: Record<string, number> = {
  Facilities: 60,       // includes greens, bunkers, fairways - direct course impact
  Equipment: 55,        // blocks maintenance work
  Personnel: 45,        // staffing affects everything
  Programs: 42,         // revenue lever, but no playable-course impact today
  Administration: 30,   // paperwork, important but not turf-saving
};

/** Hot keywords on the standards plan that boost its weight (course-related). */
const STANDARDS_KEYWORD_BOOSTS: Array<{ keywords: string[]; bonus: number; label: string }> = [
  { keywords: ["irrigation", "water line"],            bonus: 40, label: "Irrigation-related" },
  { keywords: ["pesticide", "applicator"],             bonus: 30, label: "Chemical/applicator" },
  { keywords: ["greens mower", "greens", "aerifier",
               "verticut", "fertilizer"],              bonus: 25, label: "Direct turf impact" },
  { keywords: ["pest management"],                     bonus: 25, label: "Pest management" },
  { keywords: ["mowing", "fairway", "rough", "tee"],   bonus: 20, label: "Course maintenance" },
  { keywords: ["preventive maintenance",
               "equipment"],                           bonus: 18, label: "Equipment uptime" },
  { keywords: ["drainage"],                            bonus: 35, label: "Drainage-related" },
  { keywords: ["safety", "osha", "chemical spill",
               "emergency"],                           bonus: 25, label: "Safety / regulatory" },
  { keywords: ["sop", "training"],                     bonus: 10, label: "Operations enablement" },
];

/** Generic keyword boosts that apply to ANY source (course or standards). */
const UNIVERSAL_KEYWORD_BOOSTS: Array<{ keywords: string[]; bonus: number; label: string }> = [
  { keywords: ["seed", "overseed", "reseed"],          bonus: 15, label: "Seeding / agronomic recovery" },
  { keywords: ["moss"],                                bonus: 12, label: "Moss treatment" },
  { keywords: ["aerat", "aerif"],                      bonus: 10, label: "Aeration window" },
  { keywords: ["greens"],                              bonus: 10, label: "Greens-specific" },
];

/** Bonus from explicit priority hint. */
const PRIORITY_BONUS: Record<string, number> = {
  critical: 30,
  high: 20,
  normal: 10,
  low: 0,
  P1: 25,
  P2: 15,
  P3: 5,
  P4: 0,
};

/** Effort penalty (high effort items move down slightly so we capture quick wins). */
const EFFORT_PENALTY: Record<NonNullable<PriorityInput["effort"]>, number> = {
  Low: 0,
  Medium: 3,
  High: 8,
};

/** Status modifiers - resolved items sink to the bottom. */
const STATUS_MODIFIER: Record<ItemStatus, number> = {
  open: 0,
  in_progress: -3,    // in-progress items show slightly lower so the next un-started item rises
  monitoring: -8,
  blocked: -5,
  done: -1000,        // push to the bottom
};

const PINNED_BOOST = 1000;

// ─────────────────────────────────────────────────────────────────────────
// Tier boundaries
// ─────────────────────────────────────────────────────────────────────────

function tierFor(score: number, status: ItemStatus): PrioritizedItem["tier"] {
  if (status === "done") return "DONE";
  if (score >= 110) return "URGENT";
  if (score >= 75) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

// ─────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

export function scoreItem(item: PriorityInput): PrioritizedItem {
  const factors: ScoredFactor[] = [];

  // Base score by source
  if (item.source === "course") {
    const w = COURSE_ISSUE_WEIGHTS[(item.rawCategory ?? "other") as HoleIssueType];
    const wt = w ?? COURSE_ISSUE_WEIGHTS.other;
    factors.push({ label: `Course issue: ${wt.category}`, value: wt.score });
  } else if (item.source === "standards") {
    const sec = item.rawCategory ?? "";
    const base = STANDARDS_SECTION_WEIGHTS[sec] ?? 40;
    factors.push({ label: `Standards section: ${sec || "Unknown"}`, value: base });
  } else {
    // custom items get a neutral baseline; user can pin or bump
    factors.push({ label: "Custom item baseline", value: 40 });
  }

  // Standards keyword boosts
  if (item.source === "standards") {
    const text = `${item.title} ${item.description ?? ""}`;
    for (const k of STANDARDS_KEYWORD_BOOSTS) {
      if (matchesKeywords(text, k.keywords)) {
        factors.push({ label: k.label, value: k.bonus });
        break; // only the first match (best fit), prevent double-counting
      }
    }
  }

  // Universal keyword boosts (course AND standards AND custom)
  const txt = `${item.title} ${item.description ?? ""}`;
  for (const k of UNIVERSAL_KEYWORD_BOOSTS) {
    if (matchesKeywords(txt, k.keywords)) {
      factors.push({ label: k.label, value: k.bonus });
    }
  }

  // Priority hint
  if (item.sourcePriority && PRIORITY_BONUS[item.sourcePriority] !== undefined) {
    factors.push({
      label: `Priority: ${item.sourcePriority}`,
      value: PRIORITY_BONUS[item.sourcePriority],
    });
  }

  // Effort penalty
  if (item.effort && EFFORT_PENALTY[item.effort]) {
    factors.push({
      label: `Effort: ${item.effort}`,
      value: -EFFORT_PENALTY[item.effort],
    });
  }

  // Age bonus - items open more than a week get a small bump (avoids stale backlog)
  if (item.reportedAt) {
    const ageDays = Math.max(
      0,
      Math.floor((Date.now() - new Date(item.reportedAt).getTime()) / 86400000),
    );
    if (ageDays > 7) {
      const bump = Math.min(10, Math.floor(ageDays / 7) * 2);
      if (bump > 0) {
        factors.push({ label: `Open ${ageDays}d`, value: bump });
      }
    }
  }

  // Dependency-blocker bonus
  if (item.dependencies && item.dependencies.length > 0) {
    // These items have prerequisites - they are not blockers themselves.
    // We don't penalize them here; the prerequisite items get the bump
    // via a separate pass in prioritizeAll().
  }

  // Status modifier
  factors.push({
    label: `Status: ${item.status}`,
    value: STATUS_MODIFIER[item.status] ?? 0,
  });

  // Manual bump
  if (item.manualBump) {
    factors.push({ label: "Manual bump", value: item.manualBump });
  }

  // Pinned items go to the very top
  if (item.pinned) {
    factors.push({ label: "PINNED", value: PINNED_BOOST });
  }

  const score = factors.reduce((s, f) => s + f.value, 0);
  const tier = tierFor(score, item.status);

  return {
    ...item,
    score,
    tier,
    factors,
    explanation: explain(factors),
  };
}

function explain(factors: ScoredFactor[]): string {
  return factors
    .filter((f) => f.value !== 0)
    .map((f) => `${f.label} (${f.value > 0 ? "+" : ""}${f.value})`)
    .join(" · ");
}

/**
 * Prioritize a full list of items. Performs a dependency pass so prerequisite
 * items get bumped above items that depend on them.
 */
export function prioritizeAll(items: PriorityInput[]): PrioritizedItem[] {
  // Pre-score everything
  const scored = items.map(scoreItem);

  // Dependency pass: for every item with dependencies, find the prerequisite
  // by id and give it +5 per dependent item (cap at +20).
  const byId = new Map(scored.map((s) => [s.id, s]));
  const dependentCount = new Map<string, number>();
  for (const it of scored) {
    if (!it.dependencies) continue;
    for (const dep of it.dependencies) {
      // dependency ids in the standards plan are like "1.1.1"; our combined
      // ids prefix with the source - normalize to find a match
      const prefixed = `standards:${dep}`;
      if (byId.has(prefixed)) {
        dependentCount.set(prefixed, (dependentCount.get(prefixed) ?? 0) + 1);
      } else if (byId.has(dep)) {
        dependentCount.set(dep, (dependentCount.get(dep) ?? 0) + 1);
      }
    }
  }

  // Apply dependency bumps
  const final: PrioritizedItem[] = scored.map((s) => {
    const deps = dependentCount.get(s.id) ?? 0;
    if (deps === 0) return s;
    const bump = Math.min(20, deps * 5);
    const factors = [...s.factors, { label: `Blocks ${deps} item(s)`, value: bump }];
    const score = s.score + bump;
    return {
      ...s,
      factors,
      score,
      tier: tierFor(score, s.status),
      explanation: explain(factors),
    };
  });

  // Sort: tier first (urgent->done), then score desc, then alphabetical
  const TIER_ORDER: Record<PrioritizedItem["tier"], number> = {
    URGENT: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
    DONE: 4,
  };
  final.sort((a, b) => {
    const ta = TIER_ORDER[a.tier];
    const tb = TIER_ORDER[b.tier];
    if (ta !== tb) return ta - tb;
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });

  return final;
}

// ─────────────────────────────────────────────────────────────────────────
// Source adapters
// ─────────────────────────────────────────────────────────────────────────

/** Convert a hole_observation row into a PriorityInput. */
export function fromHoleObservation(obs: {
  id: string;
  hole_number: number;
  issue_type: HoleIssueType;
  status: HoleObservationStatus;
  priority: TaskPriority;
  title: string;
  description?: string | null;
  fix_instructions?: string | null;
  photo_url?: string | null;
  resolution_photos?: string[] | null;
  diagnosis_result?: DiagnosisResult | null;
  created_at?: string;
}): PriorityInput {
  const statusMap: Record<HoleObservationStatus, ItemStatus> = {
    open: "open",
    in_progress: "in_progress",
    resolved: "done",
    monitoring: "monitoring",
  };
  return {
    id: `course:${obs.id}`,
    source: "course",
    title: obs.title || `Hole ${obs.hole_number} — ${obs.issue_type}`,
    description: obs.description ?? undefined,
    category: COURSE_ISSUE_WEIGHTS[obs.issue_type]?.category,
    rawCategory: obs.issue_type,
    hole: obs.hole_number,
    reportedAt: obs.created_at,
    status: statusMap[obs.status] ?? "open",
    sourcePriority: obs.priority,
    fixInstructions: obs.fix_instructions ?? undefined,
    photoUrl: obs.photo_url ?? undefined,
    resolutionPhotos: obs.resolution_photos ?? undefined,
    diagnosisResult: obs.diagnosis_result ?? undefined,
  };
}

/** Convert a standards-plan entry into a PriorityInput. */
export function fromStandardsEntry(entry: {
  id: string;
  short_title: string;
  standard_text: string;
  current_state: string;
  target_state?: string;
  actions?: string[];
  section_name: string;
  priority: "P1" | "P2" | "P3" | "P4";
  effort: "Low" | "Medium" | "High";
  cost_value: number;
  owner: string;
  dependencies: string[];
  possible_score: number;
}): PriorityInput {
  return {
    id: `standards:${entry.id}`,
    source: "standards",
    title: `${entry.id} — ${entry.short_title}`,
    description: entry.current_state,
    category: entry.section_name,
    rawCategory: entry.section_name,
    status: "open",
    sourcePriority: entry.priority,
    possibleScore: entry.possible_score,
    effort: entry.effort,
    cost: entry.cost_value,
    owner: entry.owner,
    dependencies: entry.dependencies,
    fixSteps: entry.actions,
  };
}
