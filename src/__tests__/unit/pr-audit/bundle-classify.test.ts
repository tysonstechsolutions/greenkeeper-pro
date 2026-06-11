/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  classifyFileRole,
  assignBundleRoles,
} from "@/lib/pr-audit/bundle-classify";

describe("classifyFileRole", () => {
  it("detects a Section 889 by filename", () => {
    expect(classifyFileRole("RUSSO HARDWARE 889.pdf")).toBe("section_889");
    expect(classifyFileRole("section-889-rep.pdf")).toBe("section_889");
    expect(classifyFileRole("SAM.gov summary.pdf")).toBe("section_889");
    expect(classifyFileRole("Representations and Certifications.pdf")).toBe("section_889");
  });

  it("detects a quote/invoice/cart", () => {
    expect(classifyFileRole("Toro Quote 12345.pdf")).toBe("quote");
    expect(classifyFileRole("napa-invoice.jpg")).toBe("quote");
    expect(classifyFileRole("amazon cart screenshot.png")).toBe("quote");
    expect(classifyFileRole("proforma.pdf")).toBe("quote");
  });

  it("detects a purchase request", () => {
    expect(classifyFileRole("FY26-GC-0001.pdf")).toBe("pr");
    expect(classifyFileRole("Purchase Request - Toro.pdf")).toBe("pr");
    expect(classifyFileRole("NAF PR signed.pdf")).toBe("pr");
  });

  it("returns unknown when nothing matches", () => {
    expect(classifyFileRole("scan_0001.jpg")).toBe("unknown");
    expect(classifyFileRole("document.pdf")).toBe("unknown");
  });

  it("prefers 889 over other matches when both could apply", () => {
    // "quote" word present but it's clearly the 889 form
    expect(classifyFileRole("vendor 889 representation (quote attached).pdf")).toBe(
      "section_889",
    );
  });

  it("classifies a quote named after its PR number as a quote, not the PR", () => {
    // Real naming convention: every file in a bundle embeds the PR number
    // (FY26-JY-001). The explicit document word must outrank that number.
    expect(classifyFileRole("QUOTE 1-FY26-JY-001-Menards-June2026.pdf")).toBe(
      "quote",
    );
    expect(classifyFileRole("Invoice FY26-GC-0007 SiteOne.pdf")).toBe("quote");
    expect(classifyFileRole("amazon cart FY26-GC-0012.png")).toBe("quote");
  });
});

describe("assignBundleRoles", () => {
  it("keeps confident classifications", () => {
    const roles = assignBundleRoles([
      "FY26-GC-0001.pdf",
      "Toro quote.pdf",
      "Toro 889.pdf",
    ]);
    expect(roles).toEqual([
      { name: "FY26-GC-0001.pdf", role: "pr" },
      { name: "Toro quote.pdf", role: "quote" },
      { name: "Toro 889.pdf", role: "section_889" },
    ]);
  });

  it("promotes a single unknown to PR when no PR was detected", () => {
    const roles = assignBundleRoles(["scan_001.jpg", "vendor quote.pdf", "889.pdf"]);
    expect(roles.find((r) => r.name === "scan_001.jpg")?.role).toBe("pr");
  });

  it("fills missing quote/889 from leftover unknowns after assigning a PR", () => {
    const roles = assignBundleRoles([
      "Purchase Request.pdf", // pr
      "mystery1.pdf", // -> quote
      "mystery2.pdf", // -> section_889
    ]);
    const byName = Object.fromEntries(roles.map((r) => [r.name, r.role]));
    expect(byName["Purchase Request.pdf"]).toBe("pr");
    expect(byName["mystery1.pdf"]).toBe("quote");
    expect(byName["mystery2.pdf"]).toBe("section_889");
  });

  it("does not invent duplicate roles — a second PR-looking file stays as-is", () => {
    const roles = assignBundleRoles(["FY26-GC-0001.pdf", "FY26-GC-0002.pdf"]);
    // Both look like PRs; we don't force one into quote.
    expect(roles.every((r) => r.role === "pr")).toBe(true);
  });

  it("slots a real bundle where every filename embeds the PR number", () => {
    const roles = assignBundleRoles([
      "PR 1-FY26-JY-001-Menards-June2026.pdf",
      "QUOTE 1-FY26-JY-001-Menards-June2026.pdf",
      "889 1-FY26-JY-001-Menards-June2026.pdf",
    ]);
    expect(roles).toEqual([
      { name: "PR 1-FY26-JY-001-Menards-June2026.pdf", role: "pr" },
      { name: "QUOTE 1-FY26-JY-001-Menards-June2026.pdf", role: "quote" },
      { name: "889 1-FY26-JY-001-Menards-June2026.pdf", role: "section_889" },
    ]);
  });
});
