/**
 * Site, Cost Center, and G/L Account code lists for the NAVMIDLANT NAF
 * Purchase Request line items.
 *
 * Source: procurement office working list (May 2026). Update the arrays
 * below when codes are added/retired and rebuild — they appear as
 * dropdowns on every PR line item.
 */

export interface AccountingCode {
  /** The numeric code as it must appear on the form. */
  value: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
}

/** Sites the cardholder can buy against. */
export const PR_SITES: AccountingCode[] = [
  { value: "7009", label: "7009" },
  { value: "7010", label: "7010" },
];

/** Cost centers under the golf course. */
export const PR_COST_CENTERS: AccountingCode[] = [
  { value: "20086", label: "20086 — GLK VMGC GOLF MDSE RESALE" },
  { value: "20087", label: "20087 — GLK VMGC GOLF COURSE PROGRAM" },
  { value: "25224", label: "25224 — GLK VMGC GOLF RANGE PROG" },
  { value: "25229", label: "25229 — GLK VMGC GC CLUB/CART RENTAL" },
  { value: "25581", label: "25581 — GLK VMGC GC MAINTENANCE" },
];

/** G/L accounts authorized for purchase requests. */
export const PR_GL_ACCOUNTS: AccountingCode[] = [
  { value: "641000", label: "641000 — UTILITIES" },
  { value: "681000", label: "681000 — REPAIRS & MAINT VEHICLES" },
  { value: "683000", label: "683000 — FURNITURE, FIXTURES & EQUIPMENT" },
  { value: "684000", label: "684000 — REPAIRS & MAINT GROUNDS" },
  { value: "685000", label: "685000 — REPAIRS & MAINT BLDG & FAC" },
  { value: "701000", label: "701000 — SUPPLIES" },
  { value: "701003", label: "701003 — OFFICE SUPPLIES" },
  { value: "701005", label: "701005 — CLEANING TOOLS AND SUPPLIES" },
];
