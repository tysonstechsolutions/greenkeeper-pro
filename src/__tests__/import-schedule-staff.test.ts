// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  normalizeStaffName,
  findUnimportedScheduleStaff,
  splitStaffName,
  scheduleStaffPositionTitle,
} from "@/lib/staff/import-schedule-staff";

describe("findUnimportedScheduleStaff", () => {
  const schedule = [
    { full_name: "Aniya Brackett" },
    { full_name: "Bart Diaz" },
    { full_name: "  Casey  Lee " },
    { full_name: "" },
  ];

  it("spots schedule staff missing from profiles, name-insensitively", () => {
    const profiles = [
      { full_name: "aniya brackett" }, // case difference
      { full_name: "Casey Lee" }, // whitespace difference on the schedule side
      { full_name: null },
      { full_name: "Tyson Bruce" },
    ];
    const missing = findUnimportedScheduleStaff(schedule, profiles);
    expect(missing.map((m) => m.full_name)).toEqual(["Bart Diaz"]);
  });

  it("returns everyone (with a name) when no profiles match", () => {
    const missing = findUnimportedScheduleStaff(schedule, []);
    expect(missing).toHaveLength(3); // empty-name row skipped
  });

  it("normalizes names by trim/case/inner whitespace", () => {
    expect(normalizeStaffName("  Aniya   BRACKETT ")).toBe("aniya brackett");
    expect(normalizeStaffName(null)).toBe("");
  });
});

describe("splitStaffName", () => {
  it("splits first/middle/last", () => {
    expect(splitStaffName("Aniya Brackett")).toEqual({ first: "Aniya", middle: "", last: "Brackett" });
    expect(splitStaffName("Rogelio Erick Mariscal Damian")).toEqual({
      first: "Rogelio",
      middle: "Erick Mariscal",
      last: "Damian",
    });
    expect(splitStaffName("Cher")).toEqual({ first: "Cher", middle: "", last: "" });
  });
});

describe("scheduleStaffPositionTitle", () => {
  it("maps schedule positions to SF-52 titles", () => {
    expect(scheduleStaffPositionTitle("rec_aid")).toBe("Recreation Aide");
    expect(scheduleStaffPositionTitle("golf_ops_assistant")).toBe("Golf Operations Assistant");
  });
});
