import { describe, expect, it } from "vitest";
import { buildFacts, describeFacts, payPlanGrade } from "@/lib/evaluations/facts";
import { fiscalYearPeriod } from "@/lib/evaluations/period";
import type { OneOnOneSession } from "@/lib/oneonone/types";
import type { StaffConcern, StaffRecord } from "@/lib/staff/types";

const period = fiscalYearPeriod(2026);

function record(type: StaffRecord["type"], event_date: string, extra: Partial<StaffRecord> = {}): StaffRecord {
  return {
    id: `${type}-${event_date}`,
    employee_id: "emp1",
    type,
    event_date,
    title: null,
    details: null,
    hours: null,
    amount: null,
    follow_up: null,
    attachment_url: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...extra,
  };
}

function session(session_date: string, summary: string | null, status: "draft" | "completed" = "completed"): OneOnOneSession {
  return {
    id: `s-${session_date}`,
    employee_id: "emp1",
    session_date,
    template: "monthly",
    status,
    questions: [],
    summary,
    scheduled_id: null,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}

function concern(title: string, opened_on: string, status: "open" | "reconciled", reconciled_on: string | null = null): StaffConcern {
  return { id: title, employee_id: "emp1", title, opened_on, status, reconciled_on, updates: [], created_by: null, created_at: "", updated_at: "" };
}

describe("buildFacts", () => {
  it("counts only what falls inside the rating period", () => {
    const facts = buildFacts({
      period,
      hireDate: "2021-04-12",
      personnel: { position_title: " Laborer ", pay_plan: "NA", occ_series: "5703", pay_band: "05", step: "3" },
      certifications: [{ name: "Pesticide Applicator", issued_date: "2024-01-01", expiry_date: "2027-01-01", license_number: null }],
      records: [
        record("call_out", "2025-11-03", { hours: 8 }),
        record("call_out", "2026-07-14", { hours: 4.5 }),
        record("call_out", "2025-09-30", { hours: 8 }), // previous FY
        record("sick_time", "2026-02-02", { hours: 8 }),
        record("disciplinary", "2026-08-01", { title: "Written counseling" }),
        record("disciplinary", "2026-03-01", { details: "Verbal warning" }),
        record("holiday_pay", "2026-07-04", { hours: 8 }),
      ],
      sessions: [
        session("2026-05-01", "Talked about the license"),
        session("2026-08-01", "Wants more hours"),
        session("2026-09-01", null),
        session("2026-09-15", "Draft only", "draft"),
        session("2025-06-01", "Old"),
      ],
      concerns: [
        concern("Cart path", "2026-01-10", "reconciled", "2026-02-01"),
        concern("Pay question", "2026-06-01", "open"),
        concern("Old thing", "2024-06-01", "open"),
      ],
    });

    expect(facts.position_title).toBe("Laborer");
    expect(facts.pay_plan_grade).toBe("NA-5703-05 Step 3");
    expect(facts.call_outs).toEqual({ count: 2, hours: 12.5 });
    expect(facts.sick_time).toEqual({ count: 1, hours: 8 });
    expect(facts.disciplinary).toEqual([
      { date: "2026-03-01", title: "Verbal warning" },
      { date: "2026-08-01", title: "Written counseling" },
    ]);
    expect(facts.one_on_ones.count).toBe(3);
    expect(facts.one_on_ones.summaries.map((s) => s.date)).toEqual(["2026-08-01", "2026-05-01"]);
    expect(facts.follow_ups).toEqual({ opened: 2, reconciled: 1, open_titles: ["Pay question", "Old thing"] });
    expect(facts.certifications).toEqual([{ name: "Pesticide Applicator", expiry_date: "2027-01-01" }]);

    const lines = describeFacts(facts);
    expect(lines).toContain("2 call-outs (12.5 hrs)");
    expect(lines).toContain("1 sick-time entry (8 hrs)");
    expect(lines).toContain("3 1:1s on record this period");
    expect(lines.some((l) => l.startsWith("2 disciplinary records"))).toBe(true);
  });

  it("handles an employee with nothing on file", () => {
    const facts = buildFacts({ period, hireDate: null, personnel: null, certifications: null, records: [], sessions: [], concerns: [] });
    expect(facts.pay_plan_grade).toBeNull();
    expect(facts.call_outs).toEqual({ count: 0, hours: 0 });
    expect(describeFacts(facts)).toEqual(["0 call-outs", "0 sick-time entries", "0 1:1s on record this period"]);
    expect(payPlanGrade({ pay_plan: "NF", pay_band: "02" })).toBe("NF-02");
  });
});
