/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  normalizeInternalOrder,
  normalizeVendorName,
  findExistingMatch,
  type MatchableAudit,
} from "@/lib/pr-audit/pr-identity";

function audit(over: Partial<MatchableAudit> & { id: string }): MatchableAudit {
  return {
    internal_order: null,
    file_name: null,
    vendor_name: null,
    pr_date: null,
    computed_total: 0,
    ...over,
  };
}

describe("normalizeInternalOrder", () => {
  it("uppercases and strips spacing/punctuation noise", () => {
    expect(normalizeInternalOrder(" fy26-gc-0001 ")).toBe("FY26-GC-0001");
    expect(normalizeInternalOrder("FY26 GC 0001")).toBe("FY26-GC-0001");
  });
  it("returns empty for blank/missing", () => {
    expect(normalizeInternalOrder(null)).toBe("");
    expect(normalizeInternalOrder("   ")).toBe("");
  });
});

describe("normalizeVendorName", () => {
  it("drops Inc/LLC/Corp, punctuation and case", () => {
    expect(normalizeVendorName("Russo Hardware, Inc.")).toBe(
      normalizeVendorName("RUSSO HARDWARE LLC"),
    );
    expect(normalizeVendorName("Toro Company")).toBe("toro");
  });
});

describe("findExistingMatch", () => {
  const existing: MatchableAudit[] = [
    audit({
      id: "a1",
      internal_order: "FY26-GC-0001",
      file_name: "toro-pr.pdf",
      vendor_name: "Toro",
      pr_date: "2026-06-01",
      computed_total: 123.6,
    }),
    audit({
      id: "a2",
      internal_order: "FY26-GC-0002",
      file_name: "deere.pdf",
      vendor_name: "John Deere",
      pr_date: "2026-06-02",
      computed_total: 500,
    }),
  ];

  it("matches on internal order first (a corrected resubmission)", () => {
    const m = findExistingMatch(
      {
        internal_order: "fy26 gc 0001", // same PR, messy formatting
        file_name: "toro-pr-CORRECTED.pdf", // different file name
        vendor_name: "Toro",
        pr_date: "2026-06-03", // date even changed
        computed_total: 130,
      },
      existing,
    );
    expect(m?.audit.id).toBe("a1");
    expect(m?.reason).toBe("internal_order");
  });

  it("falls back to an exact file-name match when no PR number", () => {
    const m = findExistingMatch(
      {
        internal_order: null,
        file_name: "Toro-PR.pdf",
        vendor_name: null,
        pr_date: null,
        computed_total: 0,
      },
      existing,
    );
    expect(m?.audit.id).toBe("a1");
    expect(m?.reason).toBe("filename");
  });

  it("falls back to vendor + date + total when neither id nor filename match", () => {
    const m = findExistingMatch(
      {
        internal_order: null,
        file_name: "scan.pdf",
        vendor_name: "toro company",
        pr_date: "2026-06-01",
        computed_total: 123.6,
      },
      existing,
    );
    expect(m?.audit.id).toBe("a1");
    expect(m?.reason).toBe("vendor_date_total");
  });

  it("returns null when nothing matches (a genuinely new PR)", () => {
    const m = findExistingMatch(
      {
        internal_order: "FY26-GC-9999",
        file_name: "brand-new.pdf",
        vendor_name: "Acme",
        pr_date: "2026-06-09",
        computed_total: 42,
      },
      existing,
    );
    expect(m).toBeNull();
  });

  it("can exclude a row by id (so a record never matches itself on update)", () => {
    const m = findExistingMatch(
      {
        internal_order: "FY26-GC-0001",
        file_name: "toro-pr.pdf",
        vendor_name: "Toro",
        pr_date: "2026-06-01",
        computed_total: 123.6,
      },
      existing,
      "a1",
    );
    expect(m).toBeNull();
  });
});
