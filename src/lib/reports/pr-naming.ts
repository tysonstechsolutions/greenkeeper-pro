/**
 * Filename conventions for the Purchase Request bundle.
 *
 * Source of truth: the procurement office's emailed instructions
 * ("STEP 3) SUBMITTING PURCHASE REQUESTS"). Examples on file:
 *   • PR – Home Depot – Marina – May 2025
 *   • QUOTE-FY25-MS-001-HomeDepot-Marina-May2025
 *   • 889-HOME DEPOT – EXPIRES 01 JAN 2026
 *
 * All filenames now embed the Internal Order ID (e.g. FY26-GC-0001) so
 * the saved files match the number printed on the PR form and the
 * procurement office can cross-reference them without ambiguity.
 *
 * When the sequence number hasn't been assigned yet (draft preview), the
 * IO slot falls back to the date string "YYYYMMDD".
 */

import type { PurchaseRequest, VendorWith889 } from "@/types/database";
import {
  fiscalYearTwoDigit,
  formatInternalOrder,
} from "@/lib/pr-internal-order";

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
 * Internal order tag for filenames: "FY26-GC-0001".
 * Falls back to "YYYYMMDD" when the sequence hasn't been assigned (drafts).
 */
function ioTag(pr: PurchaseRequest): string {
  const io = formatInternalOrder(pr.pr_sequence_number, pr.date_prepared);
  if (io) return io;
  // Draft fallback — use the prepared date so the name is still unique.
  return pr.date_prepared.replace(/-/g, "");
}

/**
 * Stand-in for the 4-digit sequence in a filename shown BEFORE the PR is
 * saved. Postgres hands out the real number on insert, so a draft can only
 * promise the shape. `resolveIoSeqPlaceholder` swaps in the real digits once
 * the insert comes back.
 */
export const IO_SEQ_PLACEHOLDER = "####";

/** The PR's own month/year ("May2026"), not the current wall-clock month. */
function prMonthYearCompact(pr: PurchaseRequest, now: Date): string {
  const d = new Date(`${pr.date_prepared}T12:00:00`);
  return Number.isNaN(d.getTime())
    ? currentMonthYearCompact(now)
    : currentMonthYearCompact(d);
}

/**
 * PR PDF filename: "PR-{IO} - {Vendor} - Golf Course - {Month} {Year}.pdf"
 * Example: "PR-FY26-GC-0001 - Ace Hardware - Golf Course - May 2026.pdf"
 */
export function purchaseRequestPdfFilename(
  pr: PurchaseRequest,
  now: Date = new Date(),
): string {
  const vendor = sanitize(pr.vendor1_name || "Vendor");
  return `PR-${ioTag(pr)} - ${vendor} - ${PROGRAM} - ${currentMonthYear(now)}.pdf`;
}

/**
 * Quote filename: "QUOTE-{IO}-{Vendor}-Golf Course-{Month}{Year}.{ext}"
 * Example: "QUOTE-FY26-GC-0001-AceHardware-Golf Course-May2026.pdf"
 *
 * `originalExt` is what the source quote file used (pdf/jpg/png/etc).
 */
export function quoteFilename(
  pr: PurchaseRequest,
  originalExt: string,
  now: Date = new Date(),
): string {
  return `${quoteFilenameBase(pr, now)}.${originalExt}`;
}

/**
 * The quote filename without its extension:
 * "QUOTE-FY26-GC-0001-AceHardware-Golf Course-May2026".
 *
 * This is what the PR form prints in "IGE Based On" and in the "Other
 * (specify)" attachment box, so the procurement office can match the line on
 * the form to the file in the bundle. The extension is left off on purpose —
 * a quote can arrive as a PDF or as photos that get stitched into one, so the
 * form can't promise it, and the name up to the extension is what identifies
 * the document.
 *
 * The month/year comes from the PR's own `date_prepared` rather than the
 * clock, so re-downloading a May PR in August doesn't rename the file out
 * from under the label already printed on the saved form.
 *
 * Before the PR is saved the sequence number doesn't exist yet, so the slot
 * reads `####` (see IO_SEQ_PLACEHOLDER).
 */
export function quoteFilenameBase(
  pr: PurchaseRequest,
  now: Date = new Date(),
): string {
  const vendor = compactVendor(pr.vendor1_name || "Vendor");
  return `QUOTE-${quoteIoTag(pr)}-${vendor}-${PROGRAM}-${prMonthYearCompact(pr, now)}`;
}

/**
 * Internal-order tag for the quote label. Same as `ioTag` once a sequence
 * exists; before that it keeps the FY-GC shape with a `####` placeholder
 * instead of falling back to a raw date, because the label's whole job is to
 * show the user what the saved filename will look like.
 */
function quoteIoTag(pr: PurchaseRequest): string {
  const io = formatInternalOrder(pr.pr_sequence_number, pr.date_prepared);
  if (io) return io;
  const d = new Date(`${pr.date_prepared}T12:00:00`);
  const fy = fiscalYearTwoDigit(Number.isNaN(d.getTime()) ? new Date() : d);
  return `FY${fy}-GC-${IO_SEQ_PLACEHOLDER}`;
}

/**
 * Swap the `####` placeholder in a saved label for the sequence number the
 * database just assigned. Leaves any other text (including the " and SOW"
 * suffix) alone, and returns the input untouched when there's nothing to
 * resolve.
 */
export function resolveIoSeqPlaceholder(
  text: string | null | undefined,
  seq: number | null | undefined,
): string {
  const value = text ?? "";
  if (seq == null || !value.includes(IO_SEQ_PLACEHOLDER)) return value;
  return value.split(IO_SEQ_PLACEHOLDER).join(String(seq).padStart(4, "0"));
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

/**
 * SOW filename: "SOW-{IO} - {Vendor} - Golf Course - {Month} {Year}.pdf"
 * Example: "SOW-FY26-GC-0001 - Ace Hardware - Golf Course - May 2026.pdf"
 */
export function sowFilename(
  pr: PurchaseRequest,
  now: Date = new Date(),
): string {
  const vendor = sanitize(pr.vendor1_name || "Vendor");
  return `SOW-${ioTag(pr)} - ${vendor} - ${PROGRAM} - ${currentMonthYear(now)}.pdf`;
}

/**
 * ZIP bundle filename: "PR Bundle - {IO} - {Vendor} - Golf Course - {Month} {Year}.zip"
 * Example: "PR Bundle - FY26-GC-0001 - Ace Hardware - Golf Course - May 2026.zip"
 */
export function prBundleZipFilename(
  pr: PurchaseRequest,
  now: Date = new Date(),
): string {
  const vendor = sanitize(pr.vendor1_name || "Vendor");
  return `PR Bundle - ${ioTag(pr)} - ${vendor} - ${PROGRAM} - ${currentMonthYear(now)}.zip`;
}

/** Email subject suggested for sending the bundle. */
export function prEmailSubject(
  pr: PurchaseRequest,
  now: Date = new Date(),
): string {
  const vendor = sanitize(pr.vendor1_name || "Vendor").toUpperCase();
  return `PR – ${ioTag(pr)} – ${vendor} – GOLF – ${currentMonthYear(now)}`;
}
