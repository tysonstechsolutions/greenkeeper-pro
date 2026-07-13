import { describe, expect, it } from "vitest";
import {
  TRIAGE_STATES,
  SUGGESTED_INITIAL_TRIAGE,
  triageLabel,
  triageMeta,
  isTriageAttention,
  isDiagnosed,
  triageOrder,
  downtimeDays,
} from "@/lib/equipment/triage";

describe("equipment triage", () => {
  it("defines exactly the nine approved states", () => {
    expect(TRIAGE_STATES).toHaveLength(9);
    expect(TRIAGE_STATES.map((s) => s.status)).toEqual([
      "unknown_problem",
      "needs_inspection",
      "diagnosed",
      "waiting_on_parts",
      "waiting_on_vendor",
      "repair_in_progress",
      "ready_for_testing",
      "returned_to_service",
      "replacement_candidate",
    ]);
  });

  it("labels untriaged units without inventing a state", () => {
    expect(triageLabel(null)).toBe("Not triaged");
    expect(triageMeta(null)).toBeNull();
    expect(triageMeta(undefined)).toBeNull();
  });

  it("suggests an initial state that is a human default, not an inference", () => {
    expect(SUGGESTED_INITIAL_TRIAGE).toBe("needs_inspection");
  });

  it("marks in-flight states as needing attention and returned_to_service as not", () => {
    expect(isTriageAttention("unknown_problem")).toBe(true);
    expect(isTriageAttention("waiting_on_parts")).toBe(true);
    expect(isTriageAttention("replacement_candidate")).toBe(true);
    expect(isTriageAttention("returned_to_service")).toBe(false);
    expect(isTriageAttention(null)).toBe(false);
  });

  it("treats a diagnosis as established only from a diagnosed-or-later state", () => {
    expect(isDiagnosed("unknown_problem")).toBe(false);
    expect(isDiagnosed("needs_inspection")).toBe(false);
    expect(isDiagnosed("diagnosed")).toBe(true);
    expect(isDiagnosed("waiting_on_parts")).toBe(true);
    expect(isDiagnosed(null)).toBe(false);
  });

  it("sorts untriaged after every explicit state", () => {
    expect(triageOrder("unknown_problem")).toBe(0);
    expect(triageOrder(null)).toBe(Number.MAX_SAFE_INTEGER);
  });

  describe("downtimeDays", () => {
    it("returns null with no confirmed down_since (never estimated)", () => {
      expect(downtimeDays(null, null, "2026-07-13")).toBeNull();
      expect(downtimeDays(undefined, null, "2026-07-13")).toBeNull();
    });

    it("computes whole days to today when still down", () => {
      expect(downtimeDays("2026-07-01", null, "2026-07-13")).toBe(12);
    });

    it("computes whole days to a returned date when provided", () => {
      expect(downtimeDays("2026-07-01", "2026-07-05", "2026-07-13")).toBe(4);
    });

    it("never returns negative downtime", () => {
      expect(downtimeDays("2026-07-13", null, "2026-07-01")).toBe(0);
    });
  });
});
