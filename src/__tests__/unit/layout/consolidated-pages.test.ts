import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HUB_COURSE, HUB_MONEY, HUB_PRO_SHOP, HUB_RESTAURANT, getAllSearchableEntries } from "@/lib/layout/app-catalog";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const hrefs = (entries: { href: string }[] | undefined) => (entries ?? []).map((entry) => entry.href);

// 2026-10 consolidation, approved by Tyson: pages that were second doors to
// the same thing now live as tabs, and the old URLs forward there.
describe("consolidated pages", () => {
  it("old URLs forward to their new home", () => {
    expect(read("src/app/duty-log/page.tsx")).toContain('redirect("/operations/duties?tab=history")');
    expect(read("src/app/gm/page.tsx")).toContain('redirect("/money")');
    expect(read("src/app/equipment/page.tsx")).toContain('redirect("/assets?tab=readiness")');
    expect(read("src/app/pro-shop-schedule/duties/page.tsx")).toContain('redirect("/operations/duties")');
  });

  it("menus no longer carry the duplicate doors", () => {
    const all = hrefs(getAllSearchableEntries());
    expect(all).not.toContain("/gm");
    expect(all).not.toContain("/duty-log");
    expect(all).not.toContain("/pro-shop-schedule/duties");
    expect(all).not.toContain("/equipment");
    expect(all).not.toContain("/equipment/readiness");
    expect(hrefs(HUB_PRO_SHOP.children)).not.toContain("/pro-shop-schedule/duties");
  });

  it("each merged page is still one tap from its hub", () => {
    expect(hrefs(HUB_RESTAURANT.children)).toContain("/operations/duties?tab=history");
    expect(hrefs(HUB_COURSE.children)).toContain("/assets?tab=readiness");
    expect(hrefs(HUB_MONEY.children)).toContain("/assets");
    // The Leadership Briefing's only door was the GM Dashboard.
    expect(hrefs(HUB_MONEY.children)).toContain("/reports/briefing");
  });

  it("the Money page carries what the GM Dashboard added", () => {
    const money = read("src/app/money/page.tsx");
    expect(money).toContain("<FinancialAlertBanner");
    expect(money).toContain("<FinancialWatchCard");
    expect(money).toContain("Awaiting approval");
  });
});
