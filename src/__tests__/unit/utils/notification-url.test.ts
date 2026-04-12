import { describe, it, expect } from "vitest";
import { notificationToUrl } from "@/lib/utils/notification-url";

describe("notificationToUrl", () => {
  it("maps task reference to /tasks/:id", () => {
    expect(
      notificationToUrl({ reference_type: "task", reference_id: "abc-123" })
    ).toBe("/tasks/abc-123");
  });

  it("maps channel reference to /messages?channel=:id", () => {
    expect(
      notificationToUrl({ reference_type: "channel", reference_id: "chan-1" })
    ).toBe("/messages?channel=chan-1");
  });

  it("maps equipment reference to /equipment/:id", () => {
    expect(
      notificationToUrl({ reference_type: "equipment", reference_id: "eq-7" })
    ).toBe("/equipment/eq-7");
  });

  it("maps time_off_request to /schedule/time-off (ignores reference_id)", () => {
    expect(
      notificationToUrl({
        reference_type: "time_off_request",
        reference_id: "req-42",
      })
    ).toBe("/schedule/time-off");
  });

  it("falls back to /dashboard for unknown reference_type", () => {
    expect(
      notificationToUrl({ reference_type: "unknown_type", reference_id: "x" })
    ).toBe("/dashboard");
  });

  it("falls back to /dashboard when reference_type is null", () => {
    expect(
      notificationToUrl({ reference_type: null, reference_id: null })
    ).toBe("/dashboard");
  });

  it("falls back to /tasks list when task has no reference_id", () => {
    expect(
      notificationToUrl({ reference_type: "task", reference_id: null })
    ).toBe("/tasks");
  });
});
