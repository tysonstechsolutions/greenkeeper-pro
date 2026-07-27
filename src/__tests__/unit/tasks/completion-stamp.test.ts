import { describe, expect, it } from "vitest";
import { completionStampFor, taskIdFromWorkKey } from "@/lib/tasks/completion-stamp";

const now = new Date("2026-07-26T14:30:00.000Z");
const actor = "10000000-0000-0000-0000-000000000001";

describe("completionStampFor", () => {
  it("records who finished the work and exactly when", () => {
    expect(completionStampFor("complete", actor, now)).toEqual({
      completed_at: "2026-07-26T14:30:00.000Z",
      completed_by: actor,
    });
  });

  it("never overwrites an earlier completion record", () => {
    expect(completionStampFor("complete", actor, now, "2026-07-01T09:00:00.000Z")).toBeNull();
  });

  it("stamps the verifier without touching the completion record", () => {
    expect(completionStampFor("verify", actor, now)).toEqual({
      verified_at: "2026-07-26T14:30:00.000Z",
      verified_by: actor,
    });
  });

  it("clears the history when work is reopened, because it is no longer done", () => {
    expect(completionStampFor("reopen", actor, now)).toEqual({
      completed_at: null,
      completed_by: null,
      verified_at: null,
      verified_by: null,
    });
  });

  it("writes nothing for transitions that are not completions", () => {
    expect(completionStampFor("start", actor, now)).toBeNull();
    expect(completionStampFor("mark_blocked", actor, now)).toBeNull();
  });

  it("still records the timestamp when no signed-in actor is resolvable", () => {
    expect(completionStampFor("complete", null, now)).toEqual({
      completed_at: "2026-07-26T14:30:00.000Z",
      completed_by: null,
    });
  });
});

describe("taskIdFromWorkKey", () => {
  it("accepts the two work kinds stored in the tasks table", () => {
    expect(taskIdFromWorkKey("task:abc-123")).toBe("abc-123");
    expect(taskIdFromWorkKey("duty:def-456")).toBe("def-456");
  });

  it("refuses kinds that keep their completion records elsewhere", () => {
    // Patching tasks for these would write to an unrelated row id.
    expect(taskIdFromWorkKey("obligation:abc:2026-07")).toBeNull();
    expect(taskIdFromWorkKey("step:abc")).toBeNull();
    expect(taskIdFromWorkKey("standard:abc")).toBeNull();
    expect(taskIdFromWorkKey("equipment:abc")).toBeNull();
  });

  it("handles a malformed key without throwing", () => {
    expect(taskIdFromWorkKey("task:")).toBeNull();
    expect(taskIdFromWorkKey("")).toBeNull();
  });
});
