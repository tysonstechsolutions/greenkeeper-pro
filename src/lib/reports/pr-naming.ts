/**
 * Filename conventions for the Purchase Request bundle.
 *
 * Source of truth: the procurement office's emailed instructions
 * ("STEP 3) SUBMITTING PURCHASE REQUESTS"). Examples on file:
 *   • PR – Home Depot – Marina – May 2025
 *   • QUOTE-FY25-MS-001-HomeDepot-Marina-May2025
 *   • 889-HOME DEPOT – EXPIRES 01 JAN 2026
 *
 * For VMGC the program is always "Golf Course". The month/year reflect
 * the actual current month at download time, not the date the PR was
 * created — that matches the "May 2025" example which lines up with
 * the email's send date.
 */

import type { PurchaseRequest, VendorWith889 } from "@/types/database";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const MONTH_NAMES_SHORT_UPPER = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** "Golf Course" — never changes for VMGC. */
const PROGRAM = "Golf Course";

/** Strip filename-illegal characters for cross-platform safety. */
function sanitize(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compact a vendor name for tight QUOTE-FY filenames (no spaces). */
function compactVendor(name: string): string {
  return sanitize(name).replace(/\s+/g, "");
}

/** Vendor name in upper-case for the 889 form filename. */
function vendorUpper(name: string): string {
  return sanitize(name).toUpperCase();
}

/** Current month + year formatted "May 2026". */
export function currentMonthYear(now: Date = new Date()): string {
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
}

/** Compact form for the QUOTE filename: "May2026". */
export function currentMonthYearCompact(now: Date = new Date()): string {
  return `${MONTH_NAMES[now.getMonth()]}${now.getFullYear()}`;
}

/**
 * PR filename: "PR-{Vendor} - Golf Course - {Month} {Year}.pdf"
 * Example: "PR-Ace Hardware - Golf Course - May 2026.pdf"
 */
export function purchaseRequestPdfFilename(
  pr: PurchaseRequest,
  now: Date = new Date(),
): string {
  const vendor = sanitize(pr.vendor1_name || "Vendor");
  return `PR-${vendor} - ${PROGRAM} - ${currentMonthYear(now)}.pdf`;
}

/**
 * Quote filename: "QUOTE-FY{YY}-{Vendor}-Golf Course-{Month}{Year}.{ext}"
 * Example: "QUOTE-FY26-AceHardware-Golf Course-May2026.pdf"
 *
 * `originalExt` is what the source quote file used (pdf/jpg/png/etc).
 */
export function quoteFilename(
  pr: PurchaseRequest,
  originalExt: string,
  now: Date = new Date(),
): string {
  // Fiscal year — Navy NAF runs Oct–Sep. October-onwards is next fiscal year.
  const yy = (now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear())
    .toString()
    .slice(-2);
  const vendor = compactVendor(pr.vendor1_name || "Vendor");
  return `QUOTE-FY${yy}-${vendor}-${PROGRAM}-${currentMonthYearCompact(now)}.${originalExt}`;
}

/**
 * 889 filename: "889-{VENDOR} - EXPIRES {DD MMM YYYY}.{ext}"
 * Example: "889-HOME DEPOT - EXPIRES 01 JAN 2026.pdf"
 *
 * If no expiration date is on file, fall back to "EXPIRES UNKNOWN".
 */
export function section889Filename(
  vendor: Pick<VendorWith889, "name" | "section_889_expiration_date">,
  originalExt = "pdf",
): string {
  const name = vendorUpper(vendor.name);
  let expires = "EXPIRES UNKNOWN";
  if (vendor.section_889_expiration_date) {
    const d = new Date(vendor.section_889_expiration_date);
    const dd = String(d.getDate()).padStart(2, "0");
    const mon = MONTH_NAMES_SHORT_UPPER[d.getMonth()];
    const yyyy = d.getFullYear();
    expires = `EXPIRES ${dd} ${mon} ${yyyy}`;
  }
  return `889-${name} - ${expires}.${originalExt}`;
}

/** ZIP filename for the whole PR bundle. */
export function prBundleZipFilename(
  pr: PurchaseRequest,
  now: Date = new Date(),
): string {
  const vendor = sanitize(pr.vendor1_name || "Vendor");
  return `PR Bundle - ${vendor} - ${PROGRAM} - ${currentMonthYear(now)}.zip`;
}

/** Email subject suggested for sending the bundle. */
export function prEmailSubject(
  pr: PurchaseRequest,
  now: Date = new Date(),
): string {
  const vendor = sanitize(pr.vendor1_name || "Vendor").toUpperCase();
  return `PR – ${vendor} – GOLF – ${currentMonthYear(now)}`;
}
