/**
 * Included-tax detection for uploaded quotes.
 *
 * The organization is tax-exempt, so vendor quotes must NOT include sales
 * tax. When the AI extraction finds a sales-tax line with a real dollar
 * amount, the quote is REJECTED outright — the caller un-stages the uploaded
 * pages, skips filling the form, and explains the rejection in a popup so
 * the user can request a corrected, tax-free quote from the vendor.
 *
 * Exception: vendors whose ONLINE checkout can't apply the exemption
 * (currently just Menards — the purchase card is charged tax and the vendor
 * refunds it later). Tax on their quotes is expected: it stays a line item
 * on the PR instead of triggering a rejection.
 */
import type { ExtractedQuote } from "@/lib/quote/extraction";
import { isSalesTaxItem } from "@/lib/pr-cc-fee";

/**
 * Vendors allowed to include sales tax on a quote. Add more vendors here as
 * needed — no edge-function redeploy required.
 */
export const TAX_CHARGING_VENDORS: readonly RegExp[] = [/\bmenards\b/i];

/** True when the vendor is allowed to include sales tax on a quote. */
export function isTaxChargingVendor(vendorText: string): boolean {
  return TAX_CHARGING_VENDORS.some((re) => re.test(vendorText));
}

/** Why a quote was rejected: the tax that was found on it. */
export interface QuoteTaxRejection {
  /** Total tax dollars found across the quote's tax lines, rounded to cents. */
  taxAmount: number;
  /** The offending line descriptions as printed on the quote. */
  taxLines: string[];
}

/**
 * Decide whether an extracted quote must be rejected for including tax.
 *
 * Returns the rejection details when the quote carries at least one
 * sales-tax line with a positive amount and the vendor (from the extraction
 * or the form) is not a tax-charging vendor. Returns null when the quote is
 * acceptable: no tax line, only $0.00 tax lines (tax isn't actually
 * charged), or a tax-charging vendor like Menards.
 *
 * A tax line's amount is qty × unit price with a missing/zero qty treated
 * as 1 — extractors sometimes omit qty on fee rows, and "Sales Tax $12.34"
 * is $12.34 of tax, not $0.
 */
export function checkQuoteForIncludedTax(
  result: ExtractedQuote,
  formVendorName: string,
): QuoteTaxRejection | null {
  const vendorText = `${result.vendor?.name ?? ""} ${formVendorName ?? ""}`;
  if (isTaxChargingVendor(vendorText)) return null;

  const taxItems = (result.items ?? []).filter(isSalesTaxItem);
  if (taxItems.length === 0) return null;

  const taxAmount = taxItems.reduce((sum, it) => {
    const qty = Number(it.qty) || 1;
    const price = Number(it.unit_price) || 0;
    return sum + qty * price;
  }, 0);
  if (taxAmount <= 0) return null;

  return {
    taxAmount: Math.round(taxAmount * 100) / 100,
    taxLines: taxItems.map((it) => (it.description || "").trim() || "Tax"),
  };
}
