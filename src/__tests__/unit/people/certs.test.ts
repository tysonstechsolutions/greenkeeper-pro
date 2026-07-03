import { describe, expect, it } from "vitest";
import {
  evaluateCert,
  evaluateCerts,
  type Certification,
} from "@/lib/people/certs";

const TODAY = new Date(2026, 6, 3); // Jul 3 2026

function cert(partial: Partial<Certification>): Certification {
  return {
    id: partial.id ?? "c1",
    holder: "Tyson",
    profile_id: null,
    cert_name: "Test Cert",
    license_number: null,
    issued_date: null,
    expires_date: null,
    document_path: null,
    notes: null,
    is_active: true,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("evaluateCert", () => {
  it("no expiry date → no_expiry", () => {
    const r = evaluateCert(cert({}), TODAY);
    expect(r.status).toBe("no_expiry");
    expect(r.daysUntil).toBeNull();
  });

  it("expired yesterday → expired, −1", () => {
    const r = evaluateCert(cert({ expires_date: "2026-07-02" }), TODAY);
    expect(r.status).toBe("expired");
    expect(r.daysUntil).toBe(-1);
  });

  it("expires today → expiring, 0", () => {
    const r = evaluateCert(cert({ expires_date: "2026-07-03" }), TODAY);
    expect(r.status).toBe("expiring");
    expect(r.daysUntil).toBe(0);
  });

  it("inside the 60-day lead → expiring", () => {
    const r = evaluateCert(cert({ expires_date: "2026-09-01" }), TODAY); // 60 days
    expect(r.status).toBe("expiring");
    expect(r.daysUntil).toBe(60);
  });

  it("outside the lead → ok", () => {
    const r = evaluateCert(cert({ expires_date: "2026-09-02" }), TODAY); // 61 days
    expect(r.status).toBe("ok");
  });

  it("custom lead window respected", () => {
    const r = evaluateCert(cert({ expires_date: "2026-07-20" }), TODAY, 10);
    expect(r.status).toBe("ok"); // 17 days out, lead 10
  });
});

describe("evaluateCerts", () => {
  it("sorts expired → expiring → ok → no_expiry, skips inactive", () => {
    const list = [
      cert({ id: "ok", expires_date: "2027-01-01" }),
      cert({ id: "none" }),
      cert({ id: "expired", expires_date: "2026-06-01" }),
      cert({ id: "soon", expires_date: "2026-07-20" }),
      cert({ id: "inactive", expires_date: "2026-01-01", is_active: false }),
    ];
    const out = evaluateCerts(list, TODAY);
    expect(out.map((e) => e.cert.id)).toEqual(["expired", "soon", "ok", "none"]);
  });

  it("oldest lapse floats to the top among expired", () => {
    const out = evaluateCerts(
      [
        cert({ id: "recent", expires_date: "2026-07-01" }),
        cert({ id: "old", expires_date: "2026-03-01" }),
      ],
      TODAY,
    );
    expect(out[0].cert.id).toBe("old");
  });
});
