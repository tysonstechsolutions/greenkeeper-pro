import { describe, it, expect } from "vitest";
import {
  buildInsightsPayload,
  snapshotDataPoints,
} from "@/lib/oneonone/insights";
import type { OneOnOneSession } from "@/lib/oneonone/types";

function session(
  employee_id: string,
  session_date: string,
  answers: [string, string][],
): OneOnOneSession {
  return {
    id: `s-${employee_id}-${session_date}`,
    employee_id,
    session_date,
    template: "monthly",
    status: "completed",
    questions: answers.map(([prompt, answer], i) => ({
      id: `q${i}`,
      section: "Check-in",
      prompt,
      answer,
    })),
    summary: "recap",
    scheduled_id: null,
    created_by: null,
    created_at: `${session_date}T12:00:00Z`,
    updated_at: `${session_date}T12:00:00Z`,
  };
}

const profiles = [
  { id: "e1", full_name: "Alex Green", role: "crew" },
  { id: "e2", full_name: "Sam Fields", role: "mechanic" },
];

describe("buildInsightsPayload", () => {
  it("groups sessions by employee and attaches open follow-ups", () => {
    const sessions = [
      session("e1", "2026-07-10", [["Workload?", "Fine, but wants more hours"]]),
      session("e2", "2026-07-11", [["Anything else?", "Frustrated with pay"]]),
    ];
    const concerns = [
      { employee_id: "e1", title: "More hours", status: "open" },
    ];
    const payload = buildInsightsPayload(
      sessions,
      concerns,
      profiles,
      null,
      "all time",
    );
    expect(payload.employees).toHaveLength(2);
    const alex = payload.employees.find((e) => e.name === "Alex Green");
    expect(alex?.open_follow_ups).toEqual(["More hours"]);
    expect(alex?.sessions[0].answers[0]).toContain("wants more hours");
    expect(snapshotDataPoints(payload)).toBe(3); // 2 answers + 1 follow-up
  });

  it("respects the date cutoff", () => {
    const sessions = [
      session("e1", "2026-07-10", [["Q", "recent"]]),
      session("e1", "2026-01-01", [["Q", "old"]]),
    ];
    const payload = buildInsightsPayload(sessions, [], profiles, "2026-06-01", "recent");
    const alex = payload.employees.find((e) => e.name === "Alex Green");
    expect(alex?.sessions).toHaveLength(1);
    expect(alex?.sessions[0].answers[0]).toContain("recent");
  });

  it("includes an employee with only an open follow-up and no session", () => {
    const payload = buildInsightsPayload(
      [],
      [{ employee_id: "e2", title: "Wants training", status: "open" }],
      profiles,
      null,
      "all time",
    );
    expect(payload.employees).toHaveLength(1);
    expect(payload.employees[0].name).toBe("Sam Fields");
  });
});
