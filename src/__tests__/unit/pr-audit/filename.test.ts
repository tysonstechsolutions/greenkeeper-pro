/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { guessExt, prAuditFilename } from "@/lib/pr-audit/filename";

describe("guessExt", () => {
  it("prefers a real extension from the filename", () => {
    expect(guessExt("quote.PDF")).toBe("pdf");
    expect(guessExt("scan.jpeg")).toBe("jpeg");
  });

  it("does not treat a dotless name as an extension", () => {
    // "file" has no extension — must fall back to the MIME type.
    expect(guessExt("file", "image/png")).toBe("png");
  });

  it("falls back to the MIME type", () => {
    expect(guessExt(null, "image/jpeg")).toBe("jpg");
    expect(guessExt(null, "application/pdf")).toBe("pdf");
    expect(guessExt(null, "image/webp")).toBe("webp");
  });

  it("defaults to pdf when nothing is known", () => {
    expect(guessExt(null)).toBe("pdf");
    expect(guessExt("", "")).toBe("pdf");
  });
});

describe("prAuditFilename", () => {
  it("formats vendor + date + ext", () => {
    expect(
      prAuditFilename({ vendor_name: "SiteOne", pr_date: "2026-05-01" }, "pdf"),
    ).toBe("PR Audit - SiteOne - 2026-05-01.pdf");
  });

  it("strips filename-illegal characters from the vendor", () => {
    expect(
      prAuditFilename({ vendor_name: "A/B:C*D?", pr_date: "2026-05-01" }, "jpg"),
    ).toBe("PR Audit - ABCD - 2026-05-01.jpg");
  });

  it("handles a missing vendor and date", () => {
    expect(prAuditFilename({ vendor_name: null, pr_date: "" }, "pdf")).toBe(
      "PR Audit - Vendor - undated.pdf",
    );
  });

  it("truncates a timestamped date to the day", () => {
    expect(
      prAuditFilename(
        { vendor_name: "Toro", pr_date: "2026-05-01T12:00:00Z" },
        "pdf",
      ),
    ).toBe("PR Audit - Toro - 2026-05-01.pdf");
  });
});
