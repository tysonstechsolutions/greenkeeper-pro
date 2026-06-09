/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  checkQuoteAgainstPr,
  check889,
  buildBundleFindings,
} from "@/lib/pr-audit/bundle-check";

// A PR's products + a 3% fee line (the fee is EXCLUDED from the quote compare).
const prItems = [
  { description: "Toro Belt", qty: 2, unit_price: 50 }, // 100
  { description: "Air Filter", qty: 1, unit_price: 20 }, // 20
  { description: "3% Credit Card Fee", qty: 1, unit_price: 3.6 }, // excluded
];
// Quote charges the same $120 of product (no fee — vendors don't add our fee).
const quoteItemsMatch = [
  { description: "Toro Belt", qty: 2, unit_price: 50 },
  { description: "Air Filter", qty: 1, unit_price: 20 },
];

describe("checkQuoteAgainstPr", () => {
  it("passes when the quote total matches the PR's pre-fee subtotal", () => {
    const findings = checkQuoteAgainstPr({
      prItems,
      prVendor: "Toro",
      quoteItems: quoteItemsMatch,
      quoteVendor: "Toro",
    });
    expect(findings.some((f) => f.code === "quote_total_mismatch")).toBe(false);
    expect(findings.some((f) => f.code === "quote_ok")).toBe(true);
  });

  it("flags a total mismatch as an error", () => {
    const findings = checkQuoteAgainstPr({
      prItems,
      prVendor: "Toro",
      quoteItems: [{ description: "Toro Belt", qty: 2, unit_price: 60 }], // 120 vs 120? -> 120; change
      quoteVendor: "Toro",
    });
    // quote total 120 vs PR pre-fee 120 — actually matches; make it clearly off:
    const off = checkQuoteAgainstPr({
      prItems,
      prVendor: "Toro",
      quoteItems: [{ description: "Toro Belt", qty: 1, unit_price: 99 }], // 99 vs 120
      quoteVendor: "Toro",
    });
    void findings;
    const mismatch = off.find((f) => f.code === "quote_total_mismatch");
    expect(mismatch).toBeTruthy();
    expect(mismatch?.severity).toBe("error");
    expect(mismatch?.detail).toContain("120");
    expect(mismatch?.detail).toContain("99");
  });

  it("flags a vendor-name mismatch as a warning", () => {
    const findings = checkQuoteAgainstPr({
      prItems,
      prVendor: "Toro",
      quoteItems: quoteItemsMatch,
      quoteVendor: "John Deere",
    });
    expect(findings.find((f) => f.code === "quote_vendor_mismatch")?.severity).toBe(
      "warning",
    );
  });

  it("treats vendor names as matching despite Inc/LLC/case/punctuation", () => {
    const findings = checkQuoteAgainstPr({
      prItems,
      prVendor: "Russo Hardware, Inc.",
      quoteItems: quoteItemsMatch,
      quoteVendor: "RUSSO HARDWARE LLC",
    });
    expect(findings.some((f) => f.code === "quote_vendor_mismatch")).toBe(false);
  });

  it("returns nothing when there is no quote to compare", () => {
    expect(
      checkQuoteAgainstPr({ prItems, prVendor: "Toro", quoteItems: null, quoteVendor: null }),
    ).toEqual([]);
  });
});

describe("check889", () => {
  const asOf = "2026-06-09";

  it("passes a compliant, unexpired 889", () => {
    const f = check889({
      present: true,
      compliant: true,
      expirationDate: "2027-01-01",
      name889: "Toro",
      prVendor: "Toro",
      asOfIso: asOf,
    });
    expect(f.find((x) => x.code === "section_889_ok")).toBeTruthy();
    expect(f.some((x) => x.severity === "error")).toBe(false);
  });

  it("errors on an expired 889", () => {
    const f = check889({
      present: true,
      compliant: true,
      expirationDate: "2026-05-01",
      name889: "Toro",
      prVendor: "Toro",
      asOfIso: asOf,
    });
    const exp = f.find((x) => x.code === "section_889_expired");
    expect(exp?.severity).toBe("error");
    expect(exp?.detail).toContain("2026-05-01");
  });

  it("errors on a non-compliant 889", () => {
    const f = check889({
      present: true,
      compliant: false,
      expirationDate: "2027-01-01",
      name889: "Toro",
      prVendor: "Toro",
      asOfIso: asOf,
    });
    expect(f.find((x) => x.code === "section_889_noncompliant")?.severity).toBe("error");
  });

  it("warns when the 889 expires within 30 days", () => {
    const f = check889({
      present: true,
      compliant: true,
      expirationDate: "2026-06-20", // 11 days out
      name889: "Toro",
      prVendor: "Toro",
      asOfIso: asOf,
    });
    expect(f.find((x) => x.code === "section_889_expiring")?.severity).toBe("warning");
  });

  it("warns when the 889's vendor doesn't match the PR vendor", () => {
    const f = check889({
      present: true,
      compliant: true,
      expirationDate: "2027-01-01",
      name889: "John Deere",
      prVendor: "Toro",
      asOfIso: asOf,
    });
    expect(f.find((x) => x.code === "section_889_vendor_mismatch")?.severity).toBe(
      "warning",
    );
  });

  it("returns nothing when no 889 is present", () => {
    expect(
      check889({
        present: false,
        compliant: null,
        expirationDate: null,
        name889: null,
        prVendor: "Toro",
        asOfIso: asOf,
      }),
    ).toEqual([]);
  });
});

describe("buildBundleFindings", () => {
  it("notes a missing quote/889 only when it's clearly a bundle", () => {
    // Has a 889 but no quote → should note the missing quote.
    const f = buildBundleFindings({
      prItems,
      prVendor: "Toro",
      quote: null,
      section889: { present: true, compliant: true, expirationDate: "2027-01-01", name: "Toro" },
      asOfIso: "2026-06-09",
    });
    expect(f.some((x) => x.code === "quote_missing")).toBe(true);
  });

  it("produces no findings for a plain PR-only upload (no quote, no 889)", () => {
    const f = buildBundleFindings({
      prItems,
      prVendor: "Toro",
      quote: null,
      section889: { present: false, compliant: null, expirationDate: null, name: null },
      asOfIso: "2026-06-09",
    });
    expect(f).toEqual([]);
  });
});
