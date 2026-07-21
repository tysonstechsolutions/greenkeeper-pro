import { describe, expect, it } from "vitest";
import { interpretTaskInstruction } from "@/lib/operational-work/instruction-interpreter";
import { buildTaskEmailDraft, draftToMailto } from "@/lib/operational-work/email-draft";
import type { OperationalWorkItem } from "@/lib/operational-work/types";

// Wednesday, 2026-07-15
const today = new Date(2026, 6, 15);
const staff = [
  { id: "j", name: "John Smith" },
  { id: "m", name: "Maria Diaz" },
];
const ctx = (dueDate: string | null = null) => ({ today, dueDate, staff });

describe("interpretTaskInstruction", () => {
  it("moves a task to the next occurrence of a named weekday", () => {
    const action = interpretTaskInstruction("This starts every Wednesday, move this task to Wednesday", ctx());
    expect(action.kind).toBe("reschedule");
    if (action.kind !== "reschedule") return;
    expect(action.date).toBe("2026-07-22"); // next Wednesday, never today
    expect(action.recurringHint).toContain("repeat");
  });

  it("handles tomorrow, next week, and explicit dates", () => {
    expect(interpretTaskInstruction("push this to tomorrow", ctx())).toMatchObject({ kind: "reschedule", date: "2026-07-16" });
    expect(interpretTaskInstruction("do it next week", ctx())).toMatchObject({ kind: "reschedule", date: "2026-07-22" });
    expect(interpretTaskInstruction("move to 2026-09-15", ctx())).toMatchObject({ kind: "reschedule", date: "2026-09-15" });
    expect(interpretTaskInstruction("reschedule to aug 4", ctx())).toMatchObject({ kind: "reschedule", date: "2026-08-04" });
  });

  it("recognizes completion", () => {
    expect(interpretTaskInstruction("this is already done", ctx()).kind).toBe("complete");
    expect(interpretTaskInstruction("mark done", ctx()).kind).toBe("complete");
  });

  it("assigns to a named employee and carries a parsed due date", () => {
    const action = interpretTaskInstruction("assign to John for Friday", ctx());
    expect(action.kind).toBe("assign");
    if (action.kind !== "assign") return;
    expect(action.employeeId).toBe("j");
    expect(action.dueDate).toBe("2026-07-17"); // Friday
  });

  it("falls back to the item due date when assigning without a date", () => {
    const action = interpretTaskInstruction("give this to Maria", ctx("2026-08-01"));
    expect(action).toMatchObject({ kind: "assign", employeeId: "m", dueDate: "2026-08-01" });
  });

  it("reads priority intent when no date is present", () => {
    expect(interpretTaskInstruction("this is urgent", ctx())).toMatchObject({ kind: "priority", override: 400 });
    expect(interpretTaskInstruction("low priority, can wait", ctx())).toMatchObject({ kind: "priority", override: -200 });
  });

  it("prefers a concrete date over a soft priority cue", () => {
    // "can wait" is a low-priority cue, but the explicit move-to-Monday wins.
    const action = interpretTaskInstruction("this can wait, move it to next monday", ctx());
    expect(action).toMatchObject({ kind: "reschedule", date: "2026-07-20" });
  });

  it("detects an email/draft request and keeps the instruction", () => {
    const action = interpretTaskInstruction("draft an email to leadership about this", ctx());
    expect(action.kind).toBe("email");
    if (action.kind !== "email") return;
    expect(action.instruction).toContain("leadership");
  });

  it("returns unknown for text it cannot map", () => {
    expect(interpretTaskInstruction("hmm not sure about this one", ctx()).kind).toBe("unknown");
    expect(interpretTaskInstruction("", ctx()).kind).toBe("unknown");
  });
});

const item = {
  title: "Receive & stock US Foods delivery",
  description: "Check the order against the invoice, then stock the walk-in.",
  sourceLabel: "Weekly obligation",
  dueDate: "2026-07-15",
} as unknown as OperationalWorkItem;

describe("email draft", () => {
  it("builds an editable draft from the task and instruction", () => {
    const draft = buildTaskEmailDraft(item, "Ask leadership to approve overtime for the delivery", "Tyson Bruce");
    expect(draft.subject).toBe("Receive & stock US Foods delivery");
    expect(draft.body).toContain("Receive & stock US Foods delivery");
    expect(draft.body).toContain("approve overtime");
    expect(draft.body).toContain("Tyson Bruce");
    expect(draft.to).toBe("");
  });

  it("produces a usable mailto URL", () => {
    const url = draftToMailto({ to: "boss@example.mil", subject: "A & B", body: "line one\nline two" });
    expect(url.startsWith("mailto:")).toBe(true);
    expect(url).toContain("subject=A%20%26%20B");
    expect(url).toContain("line%20one");
  });
});
