import { describe, it, expect } from "vitest";
import { notificationToUrl } from "@/lib/utils/notification-url";

describe("notificationToUrl", () => {
  // Routes use the actual Next.js page paths under /tasks/view and
  // /equipment/view (not bare /tasks/:id / /equipment/:id).
  it("maps task reference to /tasks/view?id=:id", () => {
    expect(
      notificationToUrl({ reference_type: "task", reference_id: "abc-123" })
    ).toBe("/tasks/view?id=abc-123");
  });

  it("maps equipment reference to /equipment/view?id=:id", () => {
    expect(
      notificationToUrl({ reference_type: "equipment", reference_id: "eq-7" })
    ).toBe("/equipment/view?id=eq-7");
  });

  it("falls back to /assets when equipment has no reference_id", () => {
    expect(
      notificationToUrl({ reference_type: "equipment", reference_id: null })
    ).toBe("/assets");
  });

  it("maps time_off_request to the staff schedule (ignores reference_id)", () => {
    // The standalone /schedule/time-off page was removed; time off is handled
    // on the staff schedule, and a push target must never 404.
    expect(
      notificationToUrl({
        reference_type: "time_off_request",
        reference_id: "req-42",
      })
    ).toBe("/pro-shop-schedule");
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
