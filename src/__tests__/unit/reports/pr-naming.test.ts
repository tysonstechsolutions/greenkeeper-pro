/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  IO_SEQ_PLACEHOLDER,
  quoteFilename,
  quoteFilenameBase,
  resolveIoSeqPlaceholder,
} from "@/lib/reports/pr-naming";
import type { PurchaseRequest } from "@/types/database";

function pr(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    date_prepared: "2026-08-26",
    vendor1_name: "Ace Hardware",
    pr_sequence_number: 1,
    ...overrides,
  } as PurchaseRequest;
}

describe("quoteFilenameBase", () => {
  it("builds the name procurement files the quote under", () => {
    expect(quoteFilenameBase(pr())).toBe(
      "QUOTE-FY26-GC-0001-AceHardware-Golf Course-August2026",
    );
  });

  it("takes the month from the PR, not from the clock", () => {
    // Re-downloading a May PR in August must not rename its quote.
    expect(
      quoteFilenameBase(
        pr({ date_prepared: "2026-05-04" }),
        new Date("2026-08-26T12:00:00Z"),
      ),
    ).toBe("QUOTE-FY26-GC-0001-AceHardware-Golf Course-May2026");
  });

  it("rolls October into the next fiscal year", () => {
    expect(
      quoteFilenameBase(pr({ date_prepared: "2026-10-01", pr_sequence_number: 42 })),
    ).toBe("QUOTE-FY27-GC-0042-AceHardware-Golf Course-October2026");
  });

  it("keeps the FY-GC shape with a placeholder before the PR is saved", () => {
    expect(quoteFilenameBase(pr({ pr_sequence_number: null }))).toBe(
      `QUOTE-FY26-GC-${IO_SEQ_PLACEHOLDER}-AceHardware-Golf Course-August2026`,
    );
  });

  it("falls back to 'Vendor' when no vendor is picked yet", () => {
    expect(quoteFilenameBase(pr({ vendor1_name: null }))).toBe(
      "QUOTE-FY26-GC-0001-Vendor-Golf Course-August2026",
    );
  });

  it("strips filename-illegal characters from the vendor", () => {
    expect(quoteFilenameBase(pr({ vendor1_name: 'A/B: "Turf" <Co>' }))).toBe(
      "QUOTE-FY26-GC-0001-ABTurfCo-Golf Course-August2026",
    );
  });
});

describe("quoteFilename", () => {
  it("is the base name plus the source file's extension", () => {
    expect(quoteFilename(pr(), "pdf")).toBe(
      `${quoteFilenameBase(pr())}.pdf`,
    );
    expect(quoteFilename(pr(), "jpg")).toBe(
      `${quoteFilenameBase(pr())}.jpg`,
    );
  });

  it("matches the label the form prints, so the two never disagree", () => {
    const row = pr({ date_prepared: "2026-01-15", vendor1_name: "SiteOne" });
    const now = new Date("2026-08-26T12:00:00Z");
    expect(quoteFilename(row, "pdf", now)).toBe(
      `${quoteFilenameBase(row, now)}.pdf`,
    );
  });
});

describe("resolveIoSeqPlaceholder", () => {
  it("swaps the placeholder for the assigned, zero-padded sequence", () => {
    expect(
      resolveIoSeqPlaceholder(
        "QUOTE-FY26-GC-####-AceHardware-Golf Course-August2026",
        7,
      ),
    ).toBe("QUOTE-FY26-GC-0007-AceHardware-Golf Course-August2026");
  });

  it("keeps a trailing SOW mention intact", () => {
    expect(
      resolveIoSeqPlaceholder("QUOTE-FY26-GC-####-X-Golf Course-May2026 and SOW", 12),
    ).toBe("QUOTE-FY26-GC-0012-X-Golf Course-May2026 and SOW");
  });

  it("leaves text alone when there is no placeholder", () => {
    expect(resolveIoSeqPlaceholder("Vendor Quote", 3)).toBe("Vendor Quote");
  });

  it("leaves the placeholder alone when no sequence was assigned", () => {
    expect(resolveIoSeqPlaceholder("QUOTE-FY26-GC-####-X", null)).toBe(
      "QUOTE-FY26-GC-####-X",
    );
  });

  it("treats null/undefined text as empty", () => {
    expect(resolveIoSeqPlaceholder(null, 3)).toBe("");
    expect(resolveIoSeqPlaceholder(undefined, 3)).toBe("");
  });

  it("does not pad a sequence that is already four digits or longer", () => {
    expect(resolveIoSeqPlaceholder("QUOTE-FY26-GC-####-X", 12345)).toBe(
      "QUOTE-FY26-GC-12345-X",
    );
  });
});
