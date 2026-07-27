import { describe, expect, it } from "vitest";
import { dutyOwnershipDisplay, splitRosterByRole } from "@/lib/operations/duties";

describe("dutyOwnershipDisplay", () => {
  it("names the person when one is assigned", () => {
    expect(dutyOwnershipDisplay("maintenance_staff", "Rosie Lloyd")).toEqual({
      label: "Rosie Lloyd",
      needsAttention: false,
    });
  });

  it("names the contractor when the duty is contracted out", () => {
    expect(dutyOwnershipDisplay("contractor", null, "Acme Tree Service")).toEqual({
      label: "Acme Tree Service",
      needsAttention: false,
    });
  });

  it("treats role ownership as a complete answer, not a missing one", () => {
    // The part-time roster means a different person covers the role on
    // different days. That is the intended setup for ~155 duties.
    expect(dutyOwnershipDisplay("recreation_aide")).toEqual({
      label: "Any Recreation Aides on shift",
      needsAttention: false,
    });
    expect(dutyOwnershipDisplay("restaurant_staff").needsAttention).toBe(false);
  });

  it("flags a contractor duty with no contractor chosen", () => {
    expect(dutyOwnershipDisplay("contractor")).toEqual({
      label: "Contractor — none chosen yet",
      needsAttention: true,
    });
  });

  it("flags a duty with neither a person nor a role as a real gap", () => {
    expect(dutyOwnershipDisplay(null)).toEqual({
      label: "Not assigned to anyone or any role",
      needsAttention: true,
    });
    expect(dutyOwnershipDisplay("unassigned").needsAttention).toBe(true);
  });

  it("prefers a named person over the role description", () => {
    expect(dutyOwnershipDisplay("recreation_aide", "Aniya Brackett").label).toBe("Aniya Brackett");
  });
});

describe("splitRosterByRole", () => {
  const roster = [
    { id: "1", full_name: "Aniya Brackett", role_group: "recreation_aide" },
    { id: "2", full_name: "DJ Skinner", role_group: "golf_operations_assistant" },
    { id: "3", full_name: "Rosie Lloyd", role_group: null },
  ];

  it("puts the people in the duty's role first", () => {
    const { inRole, others } = splitRosterByRole(roster, "recreation_aide");
    expect(inRole.map((p) => p.full_name)).toEqual(["Aniya Brackett"]);
    expect(others.map((p) => p.full_name)).toEqual(["DJ Skinner", "Rosie Lloyd"]);
  });

  it("still offers everyone when nobody carries that role group", () => {
    // The maintenance crew have no role_group recorded yet, so filtering them
    // out entirely would make the duty impossible to assign.
    const { inRole, others } = splitRosterByRole(roster, "maintenance_staff");
    expect(inRole).toEqual([]);
    expect(others).toHaveLength(3);
  });

  it("offers the whole roster when the duty has no role", () => {
    expect(splitRosterByRole(roster, null).others).toHaveLength(3);
  });
});
