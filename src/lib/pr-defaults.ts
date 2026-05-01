/**
 * Facility-wide defaults that pre-fill every new Purchase Request.
 *
 * These are the addresses the procurement office expects on every PR:
 *   • Invoice Address = where Joseph Caprez (NAF accounting) processes invoices
 *   • Delivery Address = the maintenance shop / golf-course building
 *
 * Updating: change the values below and rebuild. They aren't user-editable
 * inside the app yet because they only change when the facility relocates,
 * which is roughly never. Promote to a settings table if that changes.
 */

export const PR_INVOICE_DEFAULTS = {
  address: "2601 E Paul Jones Street",
  line2: "BLDG 1 RM 129",
  city_state_zip: "Great Lakes, IL 60088",
  poc: "Joseph Caprez",
  phone: "262-510-9514",
  email: "joseph.f.caprez.naf@us.navy.mil",
} as const;

export const PR_DELIVERY_DEFAULTS = {
  address: "3012 Mississippi ST",
  line2: "BLDG 3212A Door #3",
  city_state_zip: "Great Lakes, IL 60088",
  poc: "",
  phone: "",
  email: "",
} as const;
