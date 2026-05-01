/**
 * Facility-wide defaults that pre-fill every new Purchase Request.
 *
 * Sourced from the procurement office's filled example. Updated 2026-05
 * after the office moved Joseph Caprez from invoice POC to delivery POC
 * and replaced the invoice contact with the MWR Business Office.
 *
 * Updating: change the values below and rebuild. They aren't user-editable
 * inside the app yet because they only change when the facility relocates,
 * which is roughly never. Promote to a settings table if that changes.
 *
 * "Buisness" misspelling is intentional — that's the email handle the
 * Navy actually uses.
 */

export const PR_INVOICE_DEFAULTS = {
  address: "2601 E Paul Jones Street",
  line2: "BLDG 1 RM 129",
  city_state_zip: "Great Lakes, IL 60088",
  poc: "MWR Buisness Office",
  phone: "(847) 688-2020 ex: 319",
  email: "grlkmwrbuisnessoffice@us.navy.mil",
} as const;

export const PR_DELIVERY_DEFAULTS = {
  address: "3012 Mississippi ST",
  line2: "BLDG 3212A Door #3",
  city_state_zip: "Great Lakes, IL 60088",
  poc: "Joseph Caprez",
  phone: "262-510-9514",
  email: "joseph.f.caprez.naf@us.navy.mil",
} as const;

/** Pre-filled in the Accounting section. Rest of the row is left blank. */
export const PR_ACCOUNTING_DEFAULTS = {
  company_code: "1353",
  // requesting_facility_code, project_no, program — left blank for the
  // user to fill per-PR. internal_order is auto-generated, see
  // pr-internal-order.ts.
} as const;

/** Default request method. Overridable in the form. */
export const PR_REQUEST_VIA_DEFAULT = "PURCHASE CARD";

/** Days to add to date_prepared for the default delivery date. */
export const PR_DELIVERY_DAYS = 30;
