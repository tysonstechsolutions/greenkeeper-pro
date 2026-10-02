import { describe, expect, it } from "vitest";
import { appendSuggestions, buildSuggestions, MAX_SUGGESTIONS } from "@/lib/evaluations/suggestions";
import { fiscalYearPeriod } from "@/lib/evaluations/period";
import type { OneOnOneSession } from "@/lib/oneonone/types";

const period = fiscalYearPeriod(2026);

function session(date: string, qa: [string, string][], status: "draft" | "completed" = "completed"): OneOnOneSession {
  return {
    id: date,
    employee_id: "emp1",
    session_date: date,
    template: "monthly",
    status,
    questions: qa.map(([prompt, answer], i) => ({ id: `${date}-${i}`, section: "x", prompt, answer })),
    summary: null,
    scheduled_id: null,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}

describe("suggestions from 1:1s", () => {
  it("routes the GM's recorded answers to the right evaluation question", () => {
    const s = buildSuggestions({
      period,
      sessions: [
        session("2026-03-01", [
          ["What went well since we last talked — any wins?", "Rebuilt the bunkers on 7"],
          ["Something you're doing well that I want to recognize:", "Great with members"],
          ["One thing to keep working on or do differently:", "Call in earlier when sick"],
          ["Progress on your goals; anything you want to learn or take on next?", "Wants the spray license"],
          ["What would you like to accomplish in the next 60–90 days?", "Run the greens mower solo"],
          ["Is there anything you'd still like more training on?", "Hydraulics"],
          ["What got in the way or was frustrating?", "Broken mower"],
        ]),
        session("2026-08-01", [["What went well since we last talked — any wins?", "Trained two seasonals"]]),
      ],
      engagement: { career_goals: ["Become an equipment operator"] },
    });
    // Newest first.
    expect(s.highlights.map((x) => x.text)).toEqual(["Trained two seasonals", "Rebuilt the bunkers on 7", "Great with members"]);
    expect(s.highlights[0].source).toBe("1:1 Aug 1");
    expect(s.improve.map((x) => x.text)).toEqual(["Call in earlier when sick"]);
    expect(s.goals.map((x) => x.text)).toEqual([
      "Wants the spray license",
      "Run the greens mower solo",
      "Become an equipment operator",
    ]);
    expect(s.goals[2]).toMatchObject({ source: "Career goals", date: null });
    expect(s.training.map((x) => x.text)).toEqual(["Hydraulics"]);
  });

  it("never treats feedback about the GM, or golf-course questions, as evidence", () => {
    const s = buildSuggestions({
      period,
      sessions: [
        session("2026-03-01", [
          ["What do you hope I keep doing? What do you hope I do differently as GM?", "Be around more"],
          ["Any feedback for me or the operation?", "More carts"],
          ["What do you need from me to do your job well this stretch?", "New trimmer"],
          ["Anything on the course, or with guests or members, I should know about?", "Drainage on 4"],
          ["Did the training prepare you for the job? What was missing or unclear?", "Mostly"],
        ]),
      ],
    });
    expect(s).toEqual({ highlights: [], improve: [], goals: [], training: [] });
  });

  it("skips drafts, other periods, blank and empty answers, and repeats; caps the list", () => {
    const wins = "What went well since we last talked — any wins?";
    const s = buildSuggestions({
      period,
      sessions: [
        session("2026-02-01", [[wins, "Draft only"]], "draft"),
        session("2025-09-30", [[wins, "Last year"]]),
        session("2026-04-01", [[wins, "  "], [wins, "n/a"], [wins, "Nothing."], [wins, "Fixed the pump"]]),
        session("2026-05-01", [[wins, "fixed the  pump"]]),
        ...Array.from({ length: 10 }, (_, i) => session(`2026-06-${String(i + 10)}`, [[wins, `Win ${i}`]])),
      ],
    });
    expect(s.highlights).toHaveLength(MAX_SUGGESTIONS);
    const all = buildSuggestions({ period, sessions: [session("2026-04-01", [[wins, "Fixed the pump"]]), session("2026-05-01", [[wins, "fixed the  pump"]])] });
    expect(all.highlights.map((x) => x.text)).toEqual(["fixed the pump"]);
  });

  it("appends picked suggestions one per line without repeats", () => {
    expect(appendSuggestions("", ["A", "B"])).toBe("A\nB");
    expect(appendSuggestions("A\n", ["a", "C"])).toBe("A\nC");
  });
});
