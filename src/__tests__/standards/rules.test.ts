import { describe, it, expect } from "vitest";
import {
  evaluateEquipmentReadiness,
  evaluateDutyOwnership,
  evaluateComplianceObligations,
  evaluateCourseObservations,
  mergeRuleResults,
} from "@/lib/standards/rules";

const CODE = "4.1.15";

describe("evaluateEquipmentReadiness", () => {
  it("says insufficient_data when there are no units — never 'meets'", () => {
    const r = evaluateEquipmentReadiness([], CODE);
    expect(r.evaluations[0].status).toBe("insufficient_data");
    expect(r.actions).toHaveLength(0);
  });

  it("meets standard when everything is operational", () => {
    const r = evaluateEquipmentReadiness(
      [{ id: "1", name: "Mower A", status: "operational" }],
      CODE,
    );
    expect(r.evaluations[0].status).toBe("meets_standard");
  });

  it("goes critical when CRITICAL equipment is down, and proposes work", () => {
    const r = evaluateEquipmentReadiness(
      [{ id: "1", name: "Greens Mower", status: "out_of_service", is_critical: true }],
      CODE,
    );
    expect(r.evaluations[0].status).toBe("critical");
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].priority).toBe("critical");
    expect(r.actions[0].sourceId).toBe("1");
    expect(r.actions[0].whyItMatters).toMatch(/critical/i);
  });

  it("is below_standard (not critical) when only non-critical units are down", () => {
    const r = evaluateEquipmentReadiness(
      [
        { id: "1", name: "Push Mower", status: "in_repair", is_critical: false },
        { id: "2", name: "Cart", status: "operational" },
      ],
      CODE,
    );
    expect(r.evaluations[0].status).toBe("below_standard");
    expect(r.actions[0].priority).toBe("high");
  });

  it("does NOT duplicate work when a repair is already open", () => {
    const r = evaluateEquipmentReadiness(
      [
        {
          id: "1",
          name: "Greens Mower",
          status: "out_of_service",
          is_critical: true,
          openRepairId: "wo-9",
        },
      ],
      CODE,
    );
    // The gap is still real and still reported...
    expect(r.evaluations[0].status).toBe("critical");
    // ...but we don't pile a second task on top of the existing repair.
    expect(r.actions).toHaveLength(0);
  });
});

describe("evaluateDutyOwnership", () => {
  it("flags unowned active duties and NEVER auto-assigns them", () => {
    const r = evaluateDutyOwnership(
      [
        { id: "d1", title: "Rake bunkers", is_active: true, assigneeType: "unassigned", primaryProfileId: null },
        { id: "d2", title: "Mow greens", is_active: true, assigneeType: "employee", primaryProfileId: "p1" },
      ],
      "1.3.1",
    );
    expect(r.evaluations[0].status).toBe("below_standard");
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].sourceId).toBe("d1");
    // The critical guarantee: it's a management decision, not a guess.
    expect(r.actions[0].assigneeProfileId).toBeNull();
    expect(r.actions[0].isManagementAction).toBe(true);
  });

  it("ignores inactive duties", () => {
    const r = evaluateDutyOwnership(
      [{ id: "d1", title: "Old duty", is_active: false, assigneeType: "unassigned", primaryProfileId: null }],
      "1.3.1",
    );
    expect(r.evaluations[0].status).toBe("insufficient_data");
  });

  it("treats a contractor-owned duty as owned", () => {
    const r = evaluateDutyOwnership(
      [{ id: "d1", title: "Tree work", is_active: true, assigneeType: "contractor", primaryProfileId: null }],
      "1.3.1",
    );
    expect(r.evaluations[0].status).toBe("meets_standard");
    expect(r.actions).toHaveLength(0);
  });
});

describe("evaluateComplianceObligations", () => {
  it("is critical when something is more than 30 days overdue", () => {
    const r = evaluateComplianceObligations(
      [
        {
          id: "o1",
          slug: "fire-extinguishers",
          title: "Fire extinguisher inspection",
          status: "overdue",
          dueOn: "2026-05-01",
          daysOverdue: 45,
        },
      ],
      "5.1.1",
    );
    expect(r.evaluations[0].status).toBe("critical");
    expect(r.actions[0].priority).toBe("critical");
  });

  it("assigns to the recorded owner when there is one", () => {
    const r = evaluateComplianceObligations(
      [
        {
          id: "o1",
          slug: "fire-extinguishers",
          title: "Fire extinguisher inspection",
          status: "overdue",
          dueOn: "2026-07-01",
          daysOverdue: 5,
          ownerProfileId: "dj-id",
        },
      ],
      "5.1.1",
    );
    expect(r.actions[0].assigneeProfileId).toBe("dj-id");
    expect(r.actions[0].isManagementAction).toBe(false);
  });

  it("escalates to management when the obligation has NO owner", () => {
    const r = evaluateComplianceObligations(
      [{ id: "o1", slug: "x", title: "Tank inspection", status: "overdue", dueOn: null, daysOverdue: 2 }],
      "5.1.1",
    );
    expect(r.actions[0].assigneeProfileId).toBeNull();
    expect(r.actions[0].isManagementAction).toBe(true);
  });

  it("meets standard when nothing is overdue", () => {
    const r = evaluateComplianceObligations(
      [{ id: "o1", slug: "x", title: "Y", status: "upcoming", dueOn: "2026-09-01", daysOverdue: 0 }],
      "5.1.1",
    );
    expect(r.evaluations[0].status).toBe("meets_standard");
    expect(r.actions).toHaveLength(0);
  });
});

describe("evaluateCourseObservations", () => {
  it("goes critical for a critical open observation and proposes work", () => {
    const r = evaluateCourseObservations(
      [
        {
          id: "obs1",
          title: "Severe turf loss",
          hole_number: 4,
          priority: "critical",
          status: "open",
          task_id: null,
        },
      ],
      "2.1.1",
    );
    expect(r.evaluations[0].status).toBe("critical");
    expect(r.actions).toHaveLength(1);
    expect(r.actions[0].title).toContain("Hole 4");
    // Verification is required — completing the task must not clear the standard.
    expect(r.actions[0].definitionOfDone).toMatch(/verif/i);
  });

  it("does not duplicate when the observation already has a task", () => {
    const r = evaluateCourseObservations(
      [
        {
          id: "obs1",
          title: "Severe turf loss",
          hole_number: 4,
          priority: "critical",
          status: "in_progress",
          task_id: "t1",
        },
      ],
      "2.1.1",
    );
    expect(r.evaluations[0].status).toBe("critical"); // gap still real
    expect(r.actions).toHaveLength(0); // but no duplicate work
  });

  it("ignores resolved observations", () => {
    const r = evaluateCourseObservations(
      [{ id: "o", title: "Fixed", hole_number: 1, priority: "critical", status: "resolved", task_id: null }],
      "2.1.1",
    );
    expect(r.evaluations[0].status).toBe("meets_standard");
  });

  it("does not treat low/normal observations as a standards failure", () => {
    const r = evaluateCourseObservations(
      [{ id: "o", title: "Minor", hole_number: 1, priority: "low", status: "open", task_id: null }],
      "2.1.1",
    );
    expect(r.evaluations[0].status).toBe("meets_standard");
    expect(r.actions).toHaveLength(0);
  });

  it("says insufficient_data with no observations at all", () => {
    const r = evaluateCourseObservations([], "2.1.1");
    expect(r.evaluations[0].status).toBe("insufficient_data");
  });
});

describe("mergeRuleResults", () => {
  it("combines evaluations and actions from every rule", () => {
    const a = evaluateEquipmentReadiness(
      [{ id: "1", name: "M", status: "out_of_service", is_critical: true }],
      "4.1.15",
    );
    const b = evaluateDutyOwnership(
      [{ id: "d1", title: "D", is_active: true, assigneeType: "unassigned", primaryProfileId: null }],
      "1.3.1",
    );
    const merged = mergeRuleResults([a, b]);
    expect(merged.evaluations).toHaveLength(2);
    expect(merged.actions).toHaveLength(2);
  });
});
