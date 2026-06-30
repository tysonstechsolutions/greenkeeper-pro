import { describe, it, expect } from "vitest";
import { computeSendUpReadiness } from "@/lib/pr-audit/send-up-readiness";
import type { AuditFinding } from "@/lib/pr-audit/audit";
import type { BundleFinding } from "@/lib/pr-audit/bundle-check";

function audit(partial: Partial<AuditFinding> & Pick<AuditFinding, "code" | "severity">): AuditFinding {
  return {
    title: partial.code,
    detail: "",
    suggestion: null,
    itemIndex: null,
    field: null,
    ...partial,
  };
}
function bundle(partial: Partial<BundleFinding> & Pick<BundleFinding, "code" | "severity">): BundleFinding {
  return { title: partial.code, detail: "", suggestion: null, ...partial };
}

const EMPTY = { auditFindings: [], bundleFindings: [], fitCount: 0 };

describe("computeSendUpReadiness", () => {
  it("is ready when there are no errors, warnings, or suggestions", () => {
    const r = computeSendUpReadiness(EMPTY);
    expect(r.verdict).toBe("ready");
    expect(r.headline).toMatch(/ready to send up/i);
    expect(r.blockers).toHaveLength(0);
    // Always-applicable checks pass; attachment checks are n/a when absent.
    const byKey = Object.fromEntries(r.checks.map((c) => [c.key, c.status]));
    expect(byKey.codes).toBe("pass");
    expect(byKey.totals).toBe("pass");
    expect(byKey.quote).toBe("na");
    expect(byKey.section889).toBe("na");
  });

  it("is blocked by an audit error and lists it as a blocker", () => {
    const r = computeSendUpReadiness({
      ...EMPTY,
      auditFindings: [audit({ code: "invalid_cost_center", severity: "error", title: "Invalid cost center on line 2" })],
    });
    expect(r.verdict).toBe("blocked");
    expect(r.blockers).toContain("Invalid cost center on line 2");
    expect(r.checks.find((c) => c.key === "codes")!.status).toBe("fail");
  });

  it("is blocked by a bundle error (expired 889)", () => {
    const r = computeSendUpReadiness({
      ...EMPTY,
      bundleFindings: [bundle({ code: "section_889_expired", severity: "error", title: "Section 889 expired" })],
    });
    expect(r.verdict).toBe("blocked");
    expect(r.checks.find((c) => c.key === "section889")!.status).toBe("fail");
  });

  it("needs review (not blocked) when only warnings exist", () => {
    const r = computeSendUpReadiness({
      ...EMPTY,
      auditFindings: [audit({ code: "cc_fee_rate", severity: "warning", title: "Card fee isn't 3%" })],
    });
    expect(r.verdict).toBe("review");
    expect(r.warnings).toContain("Card fee isn't 3%");
    expect(r.checks.find((c) => c.key === "fee")!.status).toBe("warn");
  });

  it("needs review when only AI cost-center suggestions exist", () => {
    const r = computeSendUpReadiness({ ...EMPTY, fitCount: 2 });
    expect(r.verdict).toBe("review");
    expect(r.optional.join(" ")).toMatch(/2/);
    expect(r.checks.find((c) => c.key === "fit")!.status).toBe("warn");
  });

  it("passes the quote check when the quote reconciles (quote_ok)", () => {
    const r = computeSendUpReadiness({
      ...EMPTY,
      bundleFindings: [bundle({ code: "quote_ok", severity: "info", title: "Quote matches" })],
    });
    expect(r.verdict).toBe("ready");
    expect(r.checks.find((c) => c.key === "quote")!.status).toBe("pass");
  });

  it("summarizes the blocker count in the headline", () => {
    const r = computeSendUpReadiness({
      ...EMPTY,
      auditFindings: [
        audit({ code: "no_items", severity: "error", title: "No line items" }),
        audit({ code: "grand_total_mismatch", severity: "error", title: "Total mismatch" }),
      ],
    });
    expect(r.verdict).toBe("blocked");
    expect(r.headline).toMatch(/2/);
  });
});
