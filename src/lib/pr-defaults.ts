/**
 * Facility-wide defaults that pre-fill every new Purchase Request.
 *
 * Sourced from the procurement office's filled example. Updated 2026-05
 * after the office moved Joseph Caprez from invoice POC to delivery POC
 * and replaced the invoice contact with the MWR Business Office, then
 * 2026-08 to match how the business office writes its own street line
 * ("2601E Paul Jones" — no space after the number, no "Street"), then
 * 2026-10 when the template named Michelle Mueller as invoice POC and
 * Megan Stadlman as delivery POC. Addresses didn't change.
 *
 * Updating: change the values below and rebuild. They aren't user-editable
 * inside the app yet because they only change when the facility relocates,
 * which is roughly never. Promote to a settings table if that changes.
 */

export const PR_INVOICE_DEFAULTS = {
  address: "2601E Paul Jones",
  line2: "BLDG 1 RM 129",
  city_state_zip: "Great Lakes, IL 60088",
  poc: "Michelle Mueller",
  phone: "(847) 688-2020 ext 318",
  email: "michele.j.mueller.naf@us.navy.mil",
} as const;

export const PR_DELIVERY_DEFAULTS = {
  address: "3012 Mississippi ST",
  line2: "BLDG 3212A Door #3",
  city_state_zip: "Great Lakes, IL 60088",
  poc: "Megan Stadlman",
  phone: "(847) 688-2020 ext 404",
  email: "megan.m.stadlman.naf@us.navy.mil",
} as const;

/** Pre-filled in the Accounting section. Rest of the row is left blank. */
export const PR_ACCOUNTING_DEFAULTS = {
  company_code: "1353",
  // VMGC's requesting facility never changes — bake it in so the user
  // doesn't have to retype it on every PR.
  requesting_facility_code: "8400",
  // Every PR out of this app is for the golf program. Same rationale as
  // the facility code — VMGC only runs golf, so this never varies.
  program: "golf",
  // project_no — left blank for the user to fill per-PR.
  // internal_order is auto-generated, see pr-internal-order.ts.
} as const;

/**
 * Site-wide defaults for the Requestor block, pre-filled on every new PR and
 * used as the print fallback when a saved row left the field blank. The user
 * can override per-PR by typing into the form.
 *
 * `email` is the requestor's official Navy address — NOT the app login account
 * (the sign-in profile's email is the shared kiosk/admin account, which must
 * never end up on an official purchase request), so it's a fixed default here
 * rather than sourced from profile.email.
 */
export const PR_REQUESTOR_DEFAULTS = {
  phone: "(847) 688-4593",
  email: "Tyson.k.bruce.naf@us.navy.mil",
} as const;

/**
 * How the request is paid/routed. The official PR template ships a "Via"
 * dropdown with only CONTRACTING OFFICE and PURCHASE CARD; CHECK is added to
 * that dropdown at PDF-generation time (see purchase-request-report.ts) so the
 * form can offer all three without editing the government template file.
 *
 * Values are stored verbatim in `purchase_requests.request_via` and written
 * straight into the PDF, so they must stay upper-case exactly as written.
 */
export const PR_REQUEST_VIA_OPTIONS = [
  "CONTRACTING OFFICE",
  "PURCHASE CARD",
  "CHECK",
] as const;

export type PrRequestVia = (typeof PR_REQUEST_VIA_OPTIONS)[number];

/** Human-readable label for each Request Via value. */
export const PR_REQUEST_VIA_LABELS: Record<PrRequestVia, string> = {
  "CONTRACTING OFFICE": "Contracting Office",
  "PURCHASE CARD": "Purchase Card",
  CHECK: "Check",
};

/** Default request method. Overridable in the form. */
export const PR_REQUEST_VIA_DEFAULT: PrRequestVia = "PURCHASE CARD";

/**
 * Days to add to date_prepared for the default required delivery date.
 * One week — procurement's standard turnaround for a card purchase.
 */
export const PR_DELIVERY_DAYS = 7;
