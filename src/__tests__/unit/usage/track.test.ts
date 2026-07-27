import { describe, expect, it } from "vitest";
import { isSafeLabel, normaliseRoute } from "@/lib/usage/track";

describe("normaliseRoute", () => {
  it("keeps a plain route as-is", () => {
    expect(normaliseRoute("/operations")).toBe("/operations");
    expect(normaliseRoute("/operations/duties")).toBe("/operations/duties");
  });

  it("drops the query string, which is where identifiers and searches live", () => {
    // A task id or a typed search term must never reach the database.
    expect(normaliseRoute("/tasks/view?id=299601d3-9959-4f8f-888a-20f6d0dcda2b"))
      .toBe("/tasks/view");
    expect(normaliseRoute("/operations?focus=task:abc&q=rosie%20lloyd"))
      .toBe("/operations");
  });

  it("drops the hash as well", () => {
    expect(normaliseRoute("/operations#section-overdue")).toBe("/operations");
  });

  it("replaces id-shaped path segments so siblings group together", () => {
    expect(normaliseRoute("/tasks/view/299601d3-9959-4f8f-888a-20f6d0dcda2b"))
      .toBe("/tasks/view/:id");
    expect(normaliseRoute("/staff/profile/12345")).toBe("/staff/profile/:id");
    expect(normaliseRoute("/assets/a1b2c3d4e5f60718")).toBe("/assets/:id");
  });

  it("replaces dated segments", () => {
    expect(normaliseRoute("/reports/briefing/2026-07-27")).toBe("/reports/briefing/:date");
  });

  it("handles the root and empty input", () => {
    expect(normaliseRoute("/")).toBe("/");
    expect(normaliseRoute("")).toBe("/");
    expect(normaliseRoute("?q=x")).toBe("/");
  });

  it("leaves ordinary words alone even when they contain digits", () => {
    expect(normaliseRoute("/dd-forms/200")).toBe("/dd-forms/:id");
    expect(normaliseRoute("/pr-audit/codes")).toBe("/pr-audit/codes");
  });
});

describe("isSafeLabel", () => {
  it("accepts the fixed vocabulary the app writes", () => {
    expect(isSafeLabel("print_by_position")).toBe(true);
    expect(isSafeLabel("cleanup_bulk_clear")).toBe(true);
    expect(isSafeLabel("task_complete")).toBe(true);
  });

  it("rejects anything that could carry typed text", () => {
    // Spaces, punctuation and capitals are the signature of free text.
    expect(isSafeLabel("Mow greens at hole 4")).toBe(false);
    expect(isSafeLabel("rosie.lloyd@example.com")).toBe(false);
    expect(isSafeLabel("note: call the vendor")).toBe(false);
    expect(isSafeLabel("")).toBe(false);
  });

  it("rejects an over-long label", () => {
    expect(isSafeLabel("a".repeat(49))).toBe(false);
    expect(isSafeLabel("a".repeat(48))).toBe(true);
  });
});
