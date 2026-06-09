/**
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  mapPurchaseRequestStatus,
  purchaseRequestToAuditPayload,
  type Vendor889,
} from "@/lib/pr-audit/pr-import";
import type { PurchaseRequest } from "@/types/database";

describe("mapPurchaseRequestStatus", () => {
  it("maps builder status → audit stage", () => {
    expect(mapPurchaseRequestStatus("submitted")).toBe("pending");
    expect(mapPurchaseRequestStatus("sent")).toBe("sent_up");
    expect(mapPurchaseRequestStatus("approved")).toBe("approved");
    // The builder's final status is "Received & Signed" — that's done, so it
    // maps to the audit's done stage, not the intermediate "received".
    expect(mapPurchaseRequestStatus("received")).toBe("receipt_signed");
    expect(mapPurchaseRequestStatus("draft")).toBe("pending");
    expect(mapPurchaseRequestStatus("whatever")).toBe("pending");
  });
});

function mkPr(over: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    id: "pr-1",
    date_prepared: "2026-05-01",
    pr_sequence_number: 30,
    vendor1_name: "Toro",
    requestor_name: "Tyson Bruce",
    attached_other: "Vendor Quote",
    status: "sent",
    quote_storage_path: "quotes/pr-1/toro.pdf",
    quote_filename: "toro.pdf",
    items: [
      { item: 1, site: "7009", cost_ctr: "25581", gl_acct: "701000", description: "Belt", qty: 2, unit: "EA", unit_price: 50 },
      { item: 2, site: "7009", cost_ctr: "25581", gl_acct: "701000", description: "3% Credit Card Fee", qty: 1, unit: "EA", unit_price: 3 },
    ],
    ...over,
  } as unknown as PurchaseRequest;
}

describe("purchaseRequestToAuditPayload", () => {
  const vendor: Vendor889 = {
    section_889_path: "889-forms/v1/toro-889.pdf",
    section_889_filename: "toro-889.pdf",
    section_889_expiration_date: "2027-01-01",
  };

  it("maps the core fields, status, and link", () => {
    const p = purchaseRequestToAuditPayload(mkPr(), vendor, "2026-06-09");
    expect(p.purchase_request_id).toBe("pr-1");
    expect(p.pr_date).toBe("2026-05-01");
    expect(p.vendor_name).toBe("Toro");
    expect(p.requestor_name).toBe("Tyson Bruce");
    expect(p.internal_order).toBe("FY26-GC-0030");
    expect(p.review_status).toBe("sent_up");
    expect(Array.isArray(p.items)).toBe(true);
    expect((p.items as unknown[]).length).toBe(2);
    expect(p.computed_total).toBe(103); // 2*50 + 3
    expect(p.revision).toBe(1);
  });

  it("carries the quote + 889 attachments through", () => {
    const p = purchaseRequestToAuditPayload(mkPr(), vendor, "2026-06-09");
    expect(p.quote_path).toBe("quotes/pr-1/toro.pdf");
    expect(p.quote_filename).toBe("toro.pdf");
    expect(p.section_889_path).toBe("889-forms/v1/toro-889.pdf");
    expect(p.section_889_expiration_date).toBe("2027-01-01");
    expect(p.section_889_compliant).toBe(true);
  });

  it("includes a built-in-app note and validates the 889 (expired → error)", () => {
    const expired: Vendor889 = { ...vendor, section_889_expiration_date: "2026-01-01" };
    const p = purchaseRequestToAuditPayload(mkPr(), expired, "2026-06-09");
    const findings = p.bundle_findings as Array<{ code: string; severity: string; title: string }>;
    expect(findings.some((f) => f.title.includes("Built in the PR app") || f.code === "quote_ok")).toBe(true);
    expect(findings.some((f) => f.code === "section_889_expired" && f.severity === "error")).toBe(true);
  });

  it("handles a PR with no vendor 889 on file", () => {
    const p = purchaseRequestToAuditPayload(mkPr(), null, "2026-06-09");
    expect(p.section_889_path).toBeNull();
    expect(p.section_889_compliant).toBeNull();
  });
});
