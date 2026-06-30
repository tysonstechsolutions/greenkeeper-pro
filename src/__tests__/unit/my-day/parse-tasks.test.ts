import { describe, it, expect } from "vitest";
import { parseTaskList } from "@/lib/my-day/parse-tasks";

describe("parseTaskList", () => {
  it("splits one task per line", () => {
    expect(parseTaskList("Fix sprinkler\nMow greens\nOrder sand")).toEqual([
      "Fix sprinkler",
      "Mow greens",
      "Order sand",
    ]);
  });

  it("strips bullets, numbering, and checkboxes", () => {
    const text = "- a\n* b\n• c\n1. d\n2) e\n[ ] f\n[x] g";
    expect(parseTaskList(text)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("drops blank lines and trims whitespace", () => {
    expect(parseTaskList("  a  \n\n\n   b\n")).toEqual(["a", "b"]);
  });

  it("handles Windows line endings", () => {
    expect(parseTaskList("a\r\nb\r\n")).toEqual(["a", "b"]);
  });

  it("takes the first column of comma/tab separated rows", () => {
    expect(parseTaskList("Fix sprinkler, Friday\nMow greens\tMonday")).toEqual([
      "Fix sprinkler",
      "Mow greens",
    ]);
  });

  it("caps the number of tasks", () => {
    const many = Array.from({ length: 250 }, (_, i) => `task ${i}`).join("\n");
    expect(parseTaskList(many).length).toBe(100);
  });
});
