// How many maintenance people a course this size needs.
//
// WHAT THIS IS, AND WHAT IT IS NOT
// -------------------------------
// This is a PLANNING MODEL, not a regulation. No Navy, CNIC or federal
// instruction sets a crew size for a golf course, and this file does not
// pretend otherwise. Program Standard 4.1.15 does say that equipment levels
// "may depend on size of staff, number of holes to be maintained, acreage to
// be maintained, length of golf season, type of turf grass, conditioning
// expectations" — which is the standard inviting exactly this calculation, but
// it does not supply the numbers.
//
// So every input below is an explicit, editable assumption, surfaced in the UI
// with its value. The arithmetic is deterministic: change an assumption and
// the answer moves in a way the GM can follow. Nothing is inferred by AI.
//
// The method is the ordinary one: acres x cuts per week / acres per hour =
// machine hours, plus a hand-work allowance, divided by productive hours per
// person per week.

export interface SurfaceAssumption {
  key: string;
  label: string;
  /** Acres of this surface. */
  acres: number;
  /** Cuts (or passes) per week in season. */
  passesPerWeek: number;
  /** Acres one operator covers per hour on the right machine, including
   *  turning, transport between holes and trimming. */
  acresPerHour: number;
  /** Where this rate comes from, in plain terms. */
  basis: string;
}

export interface StaffingAssumptions {
  /** Total maintained acreage. */
  totalAcres: number;
  surfaces: SurfaceAssumption[];
  /** Weekly hours for work that is not mowing: bunkers, cup changing, course
   *  setup, irrigation repair, spraying, projects, shop time. */
  nonMowingHoursPerWeek: number;
  /** Paid hours per person per week. */
  hoursPerPersonPerWeek: number;
  /** Share of paid time actually spent on course work, after breaks, travel,
   *  fuelling, briefings, weather stoppages and machine changeovers. */
  productiveFraction: number;
}

/**
 * Defaults for an 18-hole, ~150-acre property — the acreage the GM stated.
 *
 * The surface split is the conventional shape of an 18-hole course of this
 * size (a few acres of greens and tees, ~30 acres of fairway, the balance in
 * rough). The GM should correct these against his own measurements; that is
 * why they are parameters and not constants buried in a function.
 */
export const DEFAULT_STAFFING_ASSUMPTIONS: StaffingAssumptions = {
  totalAcres: 150,
  surfaces: [
    { key: "greens", label: "Greens", acres: 3, passesPerWeek: 6, acresPerHour: 0.7, basis: "Walk/triplex greens mowing with cup changes on the same pass" },
    { key: "tees", label: "Tees", acres: 3, passesPerWeek: 3, acresPerHour: 1.2, basis: "Triplex tee mowing including markers and trimming" },
    { key: "fairways", label: "Fairways", acres: 30, passesPerWeek: 3, acresPerHour: 3.5, basis: "Lightweight fairway unit at typical golf-course ground speed" },
    { key: "rough", label: "Rough and surrounds", acres: 90, passesPerWeek: 1, acresPerHour: 4.0, basis: "Wide-area rotary rough unit" },
  ],
  nonMowingHoursPerWeek: 60,
  hoursPerPersonPerWeek: 40,
  productiveFraction: 0.75,
};

export interface SurfaceWorkload extends SurfaceAssumption {
  /** Machine hours per week for this surface. */
  hoursPerWeek: number;
}

export interface StaffingResult {
  assumptions: StaffingAssumptions;
  surfaces: SurfaceWorkload[];
  mowingHoursPerWeek: number;
  totalHoursPerWeek: number;
  /** Hours one person actually contributes to course work per week. */
  productiveHoursPerPerson: number;
  /** Full-time equivalents needed, to one decimal. */
  requiredFte: number;
  /** Acreage not accounted for by the listed surfaces. */
  unallocatedAcres: number;
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Compute the crew requirement. Pure arithmetic over the assumptions — same
 * inputs always give the same answer, and every intermediate is returned so
 * the UI can show the working rather than just a headline number.
 */
export function calculateStaffing(
  assumptions: StaffingAssumptions = DEFAULT_STAFFING_ASSUMPTIONS,
): StaffingResult {
  const surfaces: SurfaceWorkload[] = assumptions.surfaces.map((surface) => ({
    ...surface,
    hoursPerWeek: surface.acresPerHour > 0
      ? round((surface.acres * surface.passesPerWeek) / surface.acresPerHour, 1)
      : 0,
  }));

  const mowingHoursPerWeek = round(surfaces.reduce((sum, s) => sum + s.hoursPerWeek, 0), 1);
  const totalHoursPerWeek = round(mowingHoursPerWeek + assumptions.nonMowingHoursPerWeek, 1);
  const productiveHoursPerPerson = round(
    assumptions.hoursPerPersonPerWeek * assumptions.productiveFraction, 1);
  const requiredFte = productiveHoursPerPerson > 0
    ? round(totalHoursPerWeek / productiveHoursPerPerson, 1)
    : 0;
  const allocated = assumptions.surfaces.reduce((sum, s) => sum + s.acres, 0);

  return {
    assumptions,
    surfaces,
    mowingHoursPerWeek,
    totalHoursPerWeek,
    productiveHoursPerPerson,
    requiredFte,
    unallocatedAcres: round(assumptions.totalAcres - allocated, 1),
  };
}

export interface StaffingGap {
  requiredFte: number;
  currentCrew: number;
  /** Positive when short-handed. */
  shortfallFte: number;
  /** Hours a week that nobody is available to cover. */
  uncoveredHoursPerWeek: number;
}

export function staffingGap(result: StaffingResult, currentCrew: number): StaffingGap {
  const shortfallFte = round(result.requiredFte - currentCrew, 1);
  return {
    requiredFte: result.requiredFte,
    currentCrew,
    shortfallFte,
    uncoveredHoursPerWeek: round(Math.max(0, shortfallFte) * result.productiveHoursPerPerson, 1),
  };
}
