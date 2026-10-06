// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canChangePurchaseRequest,
  canUsePurchaseRequests,
  isFbManagerRole,
  isFbStaff,
  staffForViewer,
} from "@/lib/auth/fb-manager";
import { APP_CATALOG, HUB_COURSE, HUB_MONEY, HUB_PEOPLE, HUB_RESTAURANT, resolveCatalogKey } from "@/lib/layout/app-catalog";
import { roleLabels } from "@/lib/hooks/useProfiles";
import { splitRoster, type RosterProfile } from "@/lib/evaluations/use-evaluations";
import { fiscalYearPeriod } from "@/lib/evaluations/period";

describe("F&B Manager permissions", () => {
  it("is its own role with a label", () => {
    expect(isFbManagerRole("fb_manager")).toBe(true);
    expect(isFbManagerRole("gm")).toBe(false);
    expect(roleLabels.fb_manager).toBe("F&B Manager");
  });

  it("uses purchase requests but changes only her own", () => {
    expect(canUsePurchaseRequests("fb_manager")).toBe(true);
    expect(canUsePurchaseRequests("crew")).toBe(false);
    expect(canChangePurchaseRequest("fb_manager", "brit", { created_by: "brit" })).toBe(true);
    expect(canChangePurchaseRequest("fb_manager", "brit", { created_by: "gm1" })).toBe(false);
    expect(canChangePurchaseRequest("fb_manager", "brit", { created_by: null })).toBe(false);
    expect(canChangePurchaseRequest("fb_manager", null, { created_by: null })).toBe(false);
    expect(canChangePurchaseRequest("gm", "gm1", { created_by: "brit" })).toBe(true);
    expect(canChangePurchaseRequest("crew", "c1", { created_by: "c1" })).toBe(false);
  });

  it("narrows staff lists to Food & Beverage for her only", () => {
    const staff = [
      { id: "brit", department: "food_and_beverage" },
      { id: "nate", department: "food_and_beverage" },
      { id: "oscar", department: "maintenance" },
      { id: "new", department: null },
    ];
    expect(staffForViewer("fb_manager", "brit", staff).map((s) => s.id)).toEqual(["nate"]);
    expect(staffForViewer("gm", "gm1", staff)).toBe(staff);
    expect(isFbStaff({ department: "food_and_beverage" })).toBe(true);
    expect(isFbStaff(null)).toBe(false);
  });
});

describe("F&B Manager menu", () => {
  it("gets the Buckley's menu, without course-wide workspaces", () => {
    expect(resolveCatalogKey({ isFbManager: true, isPro: false, isForeman: false, isMechanic: false, isLaborer: false })).toBe(
      "fb_manager",
    );
    expect(resolveCatalogKey({ isPro: false, isForeman: false, isMechanic: false, isLaborer: false })).toBe("leadership");
    const hrefs = APP_CATALOG.fb_manager.map((e) => e.href);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        HUB_RESTAURANT.href,
        "/pro-shop-schedule",
        "/purchase-requests/new",
        "/purchase-requests",
        "/revenue",
        "/order-list",
        "/vendors",
        "/staff",
        "/staff/one-on-ones",
        "/staff/evaluations",
        "/staff/sf52",
      ]),
    );
    for (const hidden of [HUB_COURSE.href, HUB_MONEY.href, HUB_PEOPLE.href, "/budget", "/financial-watch", "/gm"]) {
      expect(hrefs).not.toContain(hidden);
    }
  });
});

describe("F&B Manager evaluations", () => {
  const person = (id: string, department: string | null, extra: Partial<RosterProfile> = {}): RosterProfile => ({
    id,
    full_name: id,
    role: "crew",
    is_active: true,
    supervisor_id: null,
    department,
    ...extra,
  });

  it("lists the Food & Beverage staff, not herself or other departments", () => {
    const split = splitRoster({
      profiles: [person("brit", "food_and_beverage", { role: "fb_manager" }), person("nate", "food_and_beverage"), person("oscar", "maintenance")],
      annual: [],
      ninetyDay: [],
      hireDates: new Map(),
      period: fiscalYearPeriod(2026),
      viewer: { id: "brit", isManager: false, isFbManager: true },
      todayIso: "2026-10-06",
    });
    expect(split.entries.map((e) => e.profile.id)).toEqual(["nate"]);
  });
});
