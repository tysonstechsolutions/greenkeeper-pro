/**
 * Facility-level constants for the SF-52 — identical on every form for VMGC,
 * so they're never re-typed. (Veterans Memorial Golf Course, NAVSTA Great
 * Lakes MWR.)
 */
export const SF52_FACILITY = {
  /** Box 14/22 — Name and Location of Position's Organization. */
  organization: [
    "NAVSTA Great Lakes",
    "MWR Dept",
    "Veterans Memorial Golf Course, BLDG 8400",
    "Golf Course",
  ].join("\n"),
  /** Box 38 — Duty Station Code. */
  dutyStationCode: "00128",
  /** Box 39 — Duty Station. */
  dutyStation: "Great Lakes, IL 60088",
  /** Box 13/21 — Pay Basis (NAF positions are hourly). */
  payBasis: "Hourly",
} as const;
