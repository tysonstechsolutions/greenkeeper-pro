/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { isAutoOtherText, otherWithQuoteName, withSowSuffix } from "@/lib/pr-attachments";

describe("withSowSuffix", () => {
  it("appends 'and SOW' when a SOW is attached", () => {
    expect(withSowSuffix("Vendor Quote", true)).toBe("Vendor Quote and SOW");
    expect(withSowSuffix("Vendor Website Pricing", true)).toBe(
      "Vendor Website Pricing and SOW",
    );
  });

  it("is idempotent — never doubles up the suffix", () => {
    expect(withSowSuffix("Vendor Quote and SOW", true)).toBe(
      "Vendor Quote and SOW",
    );
  });

  it("strips the SOW mention when no SOW is attached", () => {
    expect(withSowSuffix("Vendor Quote and SOW", false)).toBe("Vendor Quote");
    expect(withSowSuffix("Vendor Quote", false)).toBe("Vendor Quote");
  });

  it("handles an empty base", () => {
    expect(withSowSuffix("", true)).toBe("SOW");
    expect(withSowSuffix("", false)).toBe("");
  });

  it("tolerates comma and spacing variants when stripping", () => {
    expect(withSowSuffix("Vendor Quote , SOW", false)).toBe("Vendor Quote");
    expect(withSowSuffix("Vendor Quote SOW", false)).toBe("Vendor Quote");
  });
});

describe("Other box names the quote file", () => {
  const labels = ["Vendor Quote", "Vendor Website Pricing", "Vendor Cart", "In Store Pricing"];
  const name = "QUOTE-FY27-GC-0002-AceHardware-Golf Course-September2026";

  it("treats blanks, method labels and old quote names as app-filled", () => {
    expect(isAutoOtherText("", labels)).toBe(true);
    expect(isAutoOtherText("Vendor Quote", labels)).toBe(true);
    expect(isAutoOtherText("vendor quote and SOW", labels)).toBe(true);
    expect(isAutoOtherText("QUOTE-FY26-GC-0058-TOROCOMPANY(THE)-Golf Course-August2026", labels)).toBe(true);
    expect(isAutoOtherText("Vendor Quote and invoice", labels)).toBe(false);
  });

  it("replaces app-filled text with the quote name, keeping the SOW mention", () => {
    expect(otherWithQuoteName("Vendor Quote", name, false, labels)).toBe(name);
    expect(otherWithQuoteName("Vendor Quote and SOW", name, true, labels)).toBe(`${name} and SOW`);
    expect(otherWithQuoteName("QUOTE-FY26-GC-0058-X-Golf Course-August2026", name, false, labels)).toBe(name);
  });

  it("keeps wording the user typed", () => {
    expect(otherWithQuoteName("Vendor Quote and invoice", name, false, labels)).toBe(
      "Vendor Quote and invoice",
    );
  });
});
