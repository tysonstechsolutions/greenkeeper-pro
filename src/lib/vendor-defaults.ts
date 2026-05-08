/**
 * Seed contact info for known vendors. Used by the "Sync Vendor Contacts"
 * button on the Vendors page to backfill blank fields without overwriting
 * any manual edits the user has made.
 *
 * Matched against the existing vendor row by name (case-insensitive,
 * whitespace-collapsed). To add a new vendor:
 *   1. Add an entry below
 *   2. Open /vendors and click "Sync vendor contacts"
 *
 * Address blocks come from the vendors' SAM.gov public registrations.
 * Phone/email come from the vendors' published sales/customer-service
 * contact info — these are the lines/inboxes a procurement person should
 * actually call/email, not the SAM "Government Business POC" (often a
 * personal mailbox you can't reliably reach).
 */
export interface VendorDefaults {
  /** Substrings to match against the existing vendor's name (case-insensitive). */
  matchName: string[];
  poc: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  address_line2: string | null;
  city_state_zip: string | null;
}

export const VENDOR_DEFAULTS: VendorDefaults[] = [
  {
    // Russo Hardware Inc / DBA Russo Power Equipment
    matchName: ["russo"],
    poc: "Joseph Jones",
    phone: "(847) 678-9525",
    email: "sporders@russopower.com",
    address: "9525 W. Irving Park Rd.",
    address_line2: null,
    city_state_zip: "Schiller Park, IL 60176-1923",
  },
  {
    // The Toro Company — Commercial Division (federal contracts)
    matchName: ["toro"],
    poc: "Brooke Carey, Federal Contracts Manager",
    phone: "(507) 649-2104",
    email: "brooke.carey@toro.com",
    address: "8111 Lyndale Avenue South",
    address_line2: null,
    city_state_zip: "Bloomington, MN 55420-1196",
  },
  {
    // R & R Products Inc — match patterns cover "R&R", "R & R",
    // "RandR", "R and R", "RR Products", etc. The normalize step
    // strips punctuation/whitespace before comparing.
    matchName: ["rrproducts", "randr", "rrandr"],
    poc: "Sales",
    phone: "1-800-528-3446",
    email: "sales@rrproducts.com",
    address: "3334 E Milber St",
    address_line2: null,
    city_state_zip: "Tucson, AZ 85714",
  },
  {
    // Uline Inc — covers "Uline", "U-Line", "U Line", etc.
    matchName: ["uline"],
    poc: "Customer Service",
    phone: "1-800-295-5510",
    email: "customer.service@uline.com",
    address: "12575 Uline Drive",
    address_line2: null,
    city_state_zip: "Pleasant Prairie, WI 53158-3686",
  },
  {
    // Conserv FS / Clesen / Clesens — golf course chemical & turf supply.
    // Alex Panzenhagen is the sales rep.
    matchName: ["clesens", "clesen", "conserv"],
    poc: "Alex Panzenhagen",
    phone: "(847) 561-3139",
    email: "apanzenhagen@clesens.com",
    address: null,
    address_line2: null,
    city_state_zip: null,
  },
  {
    // NAPA Auto Parts — Tim Becmer is the local rep; phone + inbox are
    // the national customer-service fallbacks until a direct line is on
    // file.
    matchName: ["napa"],
    poc: "Tim Becmer",
    phone: "1-800-538-6272",
    email: "customersupport@napaonline.com",
    address: null,
    address_line2: null,
    city_state_zip: null,
  },
  {
    // Burris Equipment / Alta Construction Equipment Illinois LLC — golf
    // course turf equipment. Bryan Heinrichs (General Manager) is the
    // signatory on the 889; he's also the point of contact at the
    // Waukegan store. Email isn't published on Burris's site (Cloudflare
    // mailto protection) — fill it in on the vendor card if you have a
    // direct address.
    matchName: ["burris", "alta construction"],
    poc: "Bryan Heinrichs, General Manager",
    phone: "(847) 336-1205",
    email: null,
    address: "2216 N. Greenbay Rd.",
    address_line2: null,
    city_state_zip: "Waukegan, IL 60087",
  },
];

/**
 * Aggressive normalization for vendor-name matching: lowercase, then
 * strip everything that isn't a letter or digit. This way "R & R", "R&R",
 * "R and R", "RandR", and "R-And-R Products" all collapse to forms that
 * a single matchName entry can target.
 */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Look up the seed defaults for a given vendor name. Returns the first
 * match (matchName uses normalized substring contains).
 */
export function findVendorDefaults(vendorName: string): VendorDefaults | null {
  const normalized = normalizeForMatch(vendorName);
  if (!normalized) return null;
  for (const def of VENDOR_DEFAULTS) {
    if (def.matchName.some((m) => normalized.includes(normalizeForMatch(m)))) {
      return def;
    }
  }
  return null;
}

/**
 * Compute which fields would be filled by syncing defaults onto the given
 * vendor. Only returns fields that are currently blank — never overwrites
 * existing values. Empty patch means nothing to do.
 */
export function computeVendorPatch(vendor: {
  name: string;
  poc: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  address_line2: string | null;
  city_state_zip: string | null;
}): Partial<VendorDefaults> | null {
  const defaults = findVendorDefaults(vendor.name);
  if (!defaults) return null;

  const patch: Record<string, string | null> = {};
  if (!vendor.poc?.trim() && defaults.poc) patch.poc = defaults.poc;
  if (!vendor.phone?.trim() && defaults.phone) patch.phone = defaults.phone;
  if (!vendor.email?.trim() && defaults.email) patch.email = defaults.email;
  if (!vendor.address?.trim() && defaults.address) patch.address = defaults.address;
  if (!vendor.address_line2?.trim() && defaults.address_line2)
    patch.address_line2 = defaults.address_line2;
  if (!vendor.city_state_zip?.trim() && defaults.city_state_zip)
    patch.city_state_zip = defaults.city_state_zip;

  return Object.keys(patch).length > 0 ? patch : null;
}
