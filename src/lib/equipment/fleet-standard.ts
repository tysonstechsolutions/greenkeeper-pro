// The required maintenance fleet, and how to recognise each class in the
// asset register.
//
// SOURCE OF THE REQUIREMENT
// ------------------------
// Program Standard 4.1.15, "Maintenance equipment - 18-hole minimums", which
// this course is already measured against. Its expected condition names the
// minimum fleet verbatim:
//
//   2 greens mowers, 2 tee mowers, 1 fairway unit, 1 rough unit,
//   1 utility mower, 1 slope mower, 2 trap rakes, 1 spray rig,
//   5 utility vehicles, 1 loader, 1 aerifier, 1 top dresser,
//   1 fertilizer spreader
//
// The standard also says levels "may depend on size of staff, number of holes
// to be maintained, acreage to be maintained, length of golf season, type of
// turf grass, conditioning expectations" — so this is a floor, not a ceiling,
// and the acreage-driven staffing model is explicitly sanctioned by it.
//
// Nothing here is invented. If a requirement is not in the standard it does
// not appear in this list.

export type FleetClass =
  | "greens_mower"
  | "tee_mower"
  | "fairway_mower"
  | "rough_mower"
  | "utility_mower"
  | "slope_mower"
  | "trap_rake"
  | "spray_rig"
  | "utility_vehicle"
  | "loader"
  | "aerifier"
  | "top_dresser"
  | "fertilizer_spreader";

/** Units that are tracked but are NOT part of the turf fleet the standard
 *  measures — office IT, kitchen appliances, shop tooling, the cart fleet. */
export type NonFleetClass =
  | "golf_cart"
  | "shop_tooling"
  | "office_or_facility"
  | "unclassified";

export type AssetClass = FleetClass | NonFleetClass;

export interface FleetRequirement {
  fleetClass: FleetClass;
  label: string;
  /** Minimum count named in Program Standard 4.1.15. */
  required: number;
  /** Why this machine matters, in the GM's terms. */
  purpose: string;
}

export const FLEET_STANDARD_CODE = "4.1.15";
export const FLEET_STANDARD_TITLE = "Maintenance equipment - 18-hole minimums";

export const FLEET_REQUIREMENTS: FleetRequirement[] = [
  { fleetClass: "greens_mower", label: "Greens mowers", required: 2, purpose: "Daily greens cut — the single biggest driver of how the course is judged." },
  { fleetClass: "tee_mower", label: "Tee mowers", required: 2, purpose: "Tee surfaces cut on their own height and frequency." },
  { fleetClass: "fairway_mower", label: "Fairway unit", required: 1, purpose: "Fairway acreage on a multi-day cycle." },
  { fleetClass: "rough_mower", label: "Rough unit", required: 1, purpose: "The largest acreage on the property." },
  { fleetClass: "utility_mower", label: "Utility mower", required: 1, purpose: "Surrounds, approaches and clean-up passes." },
  { fleetClass: "slope_mower", label: "Slope mower", required: 1, purpose: "Banks and pond edges a standard unit cannot safely cut." },
  { fleetClass: "trap_rake", label: "Trap rakes", required: 2, purpose: "Bunker presentation — a visible conditioning standard." },
  { fleetClass: "spray_rig", label: "Spray rig", required: 1, purpose: "Pesticide and fertility applications; also a compliance record." },
  { fleetClass: "utility_vehicle", label: "Utility vehicles", required: 5, purpose: "Crew transport and materials handling across 18 holes." },
  { fleetClass: "loader", label: "Loader", required: 1, purpose: "Bulk sand, soil and debris handling." },
  { fleetClass: "aerifier", label: "Aerifier", required: 1, purpose: "Core aeration — the foundation of the agronomic programme." },
  { fleetClass: "top_dresser", label: "Top dresser", required: 1, purpose: "Sand topdressing behind aeration and through the season." },
  { fleetClass: "fertilizer_spreader", label: "Fertilizer spreader", required: 1, purpose: "Granular fertility applications." },
];

/** Total machines the standard requires. */
export const FLEET_REQUIRED_TOTAL = FLEET_REQUIREMENTS.reduce((sum, r) => sum + r.required, 0);

export const FLEET_CLASS_LABELS: Record<AssetClass, string> = {
  greens_mower: "Greens mower",
  tee_mower: "Tee mower",
  fairway_mower: "Fairway unit",
  rough_mower: "Rough unit",
  utility_mower: "Utility mower",
  slope_mower: "Slope mower",
  trap_rake: "Trap rake",
  spray_rig: "Spray rig",
  utility_vehicle: "Utility vehicle",
  loader: "Loader",
  aerifier: "Aerifier",
  top_dresser: "Top dresser",
  fertilizer_spreader: "Fertilizer spreader",
  golf_cart: "Golf cart",
  shop_tooling: "Shop tooling",
  office_or_facility: "Office / facility asset",
  unclassified: "Not yet classified",
};

/**
 * Ordered keyword rules. First match wins, so the specific patterns come
 * before the general ones — "greens" must beat the bare word "mower", and
 * "bunker rake" must beat "tractor".
 *
 * Matching is done on the unit name plus its DPAS description, both
 * upper-cased in the register (e.g. "GREENS KING IV PLUS MOWER").
 */
const RULES: Array<{ cls: AssetClass; any: string[] }> = [
  // Cart fleet — measured by Standard 2.3.7, not part of the turf fleet.
  { cls: "golf_cart", any: ["GOLF CART"] },

  // Greens: brand names are the reliable signal here.
  { cls: "greens_mower", any: ["GREENSMASTER", "GREENS KING", "GREENS MOWER", "GREENSMOWER"] },
  { cls: "tee_mower", any: ["TEE MOWER", "TRIPLEX"] },
  { cls: "fairway_mower", any: ["FAIRWAY MOWER", "MOWER FAIRWAY", "LIGHTWEIGHT FAIRWAY"] },
  { cls: "slope_mower", any: ["SLOPE MOWER", "BANK MOWER", "FLAIL"] },
  { cls: "rough_mower", any: ["ROUGH CUT", "MOWER ROUGH", "ROUGH MOWER", "TURF MOWER", "ROTARY FLEX", "LASTEC"] },
  { cls: "utility_mower", any: ["ZERO TURN", "MOWER W/MULCHER", "MOWER WITH", "MOWER LAWN", "LAWN MOWER", "60\" DECK"] },

  { cls: "trap_rake", any: ["BUNKER RAKE", "BUNKER & FIELD RAKE", "BUNKER & FIELD RACK", "TRAP RAKE", "SAND RAKE"] },
  { cls: "spray_rig", any: ["SPRAYER", "SPRAY RIG"] },
  { cls: "top_dresser", any: ["TOP DRESSER", "TOPDRESSER"] },
  { cls: "fertilizer_spreader", any: ["SPREADER"] },
  { cls: "aerifier", any: ["AERATOR", "AERIFIER", "CORE HARVESTER"] },
  { cls: "loader", any: ["LOADER"] },
  { cls: "utility_vehicle", any: ["GATOR", "WORKMAN", "TRUCKSTER", "UTILITY VEHICLE", "CARRYALL", "P/UP TRUCK", "PICKUP"] },

  // Shop and facility. Kept out of the fleet maths so the gap is honest.
  { cls: "shop_tooling", any: ["GRINDER", "PRESSURE WASHER", "GENERATOR", "TILLER", "SOD CUTTER", "VOLTAGE", "PULVERIZER", "BLOWER", "ROLLER", "BALL WASHER", "CARE MACHINE"] },
  { cls: "office_or_facility", any: ["PRINTER", "LASERJET", "PC", "COMPUTER", "TV,", "TELEVISION", "REFRIGERATOR", "ICE CUBER", "TABLE", "MONITOR", "SCANNER", "PHONE"] },
];

/**
 * Classify one unit from its recorded text. Deterministic and case-insensitive.
 *
 * `equipment_type` is deliberately NOT trusted as the primary signal: 91 of
 * the 117 units in this register carry the type "other", so the names and the
 * DPAS descriptions are the only real information available.
 */
export function classifyAsset(name: string | null | undefined, description?: string | null): AssetClass {
  const haystack = `${name ?? ""} ${description ?? ""}`.toUpperCase();
  if (!haystack.trim()) return "unclassified";
  for (const rule of RULES) {
    if (rule.any.some((needle) => haystack.includes(needle))) return rule.cls;
  }
  // A bare "TRACTOR" is a prime mover; without an implement named alongside it
  // the standard has no class for it, so it stays honest rather than padding
  // a requirement it may not actually satisfy.
  return "unclassified";
}

export function isFleetClass(cls: AssetClass): cls is FleetClass {
  return FLEET_REQUIREMENTS.some((r) => r.fleetClass === cls);
}
