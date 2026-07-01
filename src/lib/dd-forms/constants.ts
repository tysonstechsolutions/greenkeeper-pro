/**
 * Shared constants + small formatting helpers for the DD-200 / NAVCOMPT-2212
 * fillers. The golf course files these under exactly three site numbers
 * (7009 / 7010 / 7011 — fixed, these are the only ones), and the organization
 * block is standing (MWR N92, Great Lakes).
 */
export const DD_SITES = ["7009", "7010", "7011"] as const;
export type DdSite = (typeof DD_SITES)[number];

/** Default activity for the 2212 "ACTIVITY NAME/LOCATION" cell. */
export const DD_ACTIVITY_DEFAULT = "NAVAL STATION GREAT LAKES MWR - GOLF";

/** DD-200 block 11b typed name of the initiator (the superintendent). Editable. */
export const DD200_INITIATOR_NAME = "Bruce Tyson K";

export const DD200_CIRCUMSTANCES = [
  { key: "lost", label: "Lost" },
  { key: "damaged", label: "Damaged" },
  { key: "destroyed", label: "Destroyed" },
] as const;

export const DD200_CATEGORIES = [
  { key: "organization", label: "Organization" },
  { key: "installation", label: "Installation" },
  { key: "ocie", label: "OCIE" },
] as const;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const p2 = (n: number) => String(n).padStart(2, "0");

/** YYYYMMDD — DD-200 blocks 1 & 3. */
export function ymd(d: Date = new Date()): string {
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
}

/** MMDDYYYY — DD-200 block 11 date signed. */
export function mdy(d: Date = new Date()): string {
  return `${p2(d.getMonth() + 1)}${p2(d.getDate())}${d.getFullYear()}`;
}

/** "25 JUN 2026" — NAVCOMPT-2212 date cell. */
export function ddMonYyyy(d: Date = new Date()): string {
  return `${p2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Multiply units x unit-cost into a currency string, or "" if not numeric. */
export function money(units: string, unitCost: string, withComma: boolean): string {
  const u = parseFloat(String(units).replace(/,/g, ""));
  const c = parseFloat(String(unitCost).replace(/,/g, ""));
  if (!isFinite(u) || !isFinite(c)) return "";
  const total = u * c;
  return withComma
    ? total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : total.toFixed(2);
}
