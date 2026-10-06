/**
 * Site, Cost Center, and G/L Account code lists for the NAVMIDLANT NAF
 * Purchase Request line items.
 *
 * The full official listings live in lib/accounting/official-codes.ts. The
 * arrays here are the codes this operation (the golf course, maintenance,
 * the pro shop, and Buckley's) uses day to day: they lead every picker and
 * seed the budget rollup. Any official code can still be chosen.
 */
import { COST_CENTER_CODES, GL_ACCOUNT_CODES, SITE_CODES } from "@/lib/accounting/official-codes";
import { COMMON_COST_CENTERS, COMMON_GL_ACCOUNTS, COMMON_SITES } from "@/lib/accounting/recommend";

export interface AccountingCode {
  /** The numeric code as it must appear on the form. */
  value: string;
  /** Human-readable label shown in the dropdown. */
  label: string;
}

function pick(list: { code: string; label: string }[], codes: string[]): AccountingCode[] {
  return codes.map((code) => {
    const hit = list.find((c) => c.code === code);
    if (!hit) throw new Error(`Accounting code ${code} is not on the official listing`);
    return { value: code, label: `${code} — ${hit.label}` };
  });
}

/** Sites this operation buys against (golf course, maintenance shop, Buckley's). */
export const PR_SITES: AccountingCode[] = pick(SITE_CODES, COMMON_SITES);

/** Cost centers for the golf course and Buckley's. */
export const PR_COST_CENTERS: AccountingCode[] = pick(COST_CENTER_CODES, COMMON_COST_CENTERS);

/** The G/L accounts purchase requests here usually use. */
export const PR_GL_ACCOUNTS: AccountingCode[] = pick(GL_ACCOUNT_CODES, COMMON_GL_ACCOUNTS);

/** Every official code, for validating and for "show all" in pickers. */
export const ALL_SITES: AccountingCode[] = SITE_CODES.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}` }));
export const ALL_COST_CENTERS: AccountingCode[] = COST_CENTER_CODES.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}` }));
export const ALL_GL_ACCOUNTS: AccountingCode[] = GL_ACCOUNT_CODES.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}` }));
