import { describe, expect, it } from "vitest";
import { APP_CATALOG, flattenCatalog } from "@/lib/layout/app-catalog";

describe("global app search catalog", () => {
  it("includes nested workspace destinations once", () => {
    const entries = flattenCatalog(APP_CATALOG.leadership);
    const hrefs = entries.map((entry) => entry.href);

    expect(hrefs).toContain("/equipment");
    expect(hrefs).toContain("/operations/duties");
    expect(hrefs).toContain("/dd-forms/200");
    expect(hrefs).toContain("/reports/monthly-board");
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("makes one-on-one paperwork discoverable by familiar terms", () => {
    const onboarding = flattenCatalog(APP_CATALOG.leadership).find(
      (entry) => entry.href === "/onboarding",
    );

    expect(onboarding?.keywords).toEqual(
      expect.arrayContaining(["1x1", "one-on-one", "coaching worksheet"]),
    );
  });
});
