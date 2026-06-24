/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { withSowSuffix } from "@/lib/pr-attachments";

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
