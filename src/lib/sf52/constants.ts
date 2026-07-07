/**
 * Facility-level constants for the SF-52 — identical on every form for VMGC,
 * so they're never re-typed. Values match the office's own filled SF-52s.
 */
export const SF52_FACILITY = {
  /**
   * Box 14/22 — Name and Location of Position's Organization. The trailing
   * newline matches the office's copies (it also keeps Acrobat/pdf.js
   * auto-sizing the block the same way theirs does).
   */
  organization: ["NAVSTA Great Lakes", "VMGC", "BLDG 8400", "Maintenance", ""].join("\n"),
  /** Default last line of the organization block. */
  defaultOrgUnit: "Maintenance",
  /** Box 38 — Duty Station Code. */
  dutyStationCode: "00128",
  /** Box 39 — Duty Station. */
  dutyStation: "Great Lakes, IL 60088",
  /** Box 5 — Action Requested By (typed name/title; signed later with a CAC). */
  requestedBy: "Tyson Bruce, Golf Course Manager",
  /** Box 6 — Action Authorized By (typed name/title). */
  authorizedBy: "Brian Weeks, MWR/N92 IPD",
} as const;

/**
 * Box 14/22 organization block for a given unit (last line) — e.g.
 * "Maintenance" for grounds crew, "Restaurant" for F&B positions.
 */
export function sf52OrganizationFor(orgUnit: string): string {
  return ["NAVSTA Great Lakes", "VMGC", "BLDG 8400", orgUnit.trim() || SF52_FACILITY.defaultOrgUnit, ""].join("\n");
}
