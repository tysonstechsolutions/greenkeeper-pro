import { describe, expect, it } from "vitest";
import {
  buildRoleDutySheets,
  buildRoleDutySheetsHtml,
} from "@/lib/operations/print-role-sheets";
import type { DutyCadence, DutyRoleGroup, OperationDuty } from "@/lib/operations/types";

let counter = 0;

function duty(partial: Partial<OperationDuty> & { title: string }): OperationDuty {
  counter += 1;
  const cadence = (partial.cadence ?? "weekly") as DutyCadence;
  return {
    id: `duty-${counter}`,
    area: "course",
    days: [],
    season: "year_round",
    note: null,
    is_active: true,
    sort_order: counter * 10,
    created_at: "2026-07-22T12:00:00",
    updated_at: "2026-07-22T12:00:00",
    role_group: "maintenance_staff",
    cadence,
    recurrence_rule: { cadence, interval: 1, weekdays: partial.days ?? [] },
    ...partial,
  };
}

describe("buildRoleDutySheets — classification", () => {
  it("puts daily cadence under Every day", () => {
    const sheets = buildRoleDutySheets([duty({ title: "Mow greens", cadence: "daily" })]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].daily.map((d) => d.title)).toEqual(["Mow greens"]);
    expect(sheets[0].weekdays).toHaveLength(0);
  });

  it("spreads weekly duties across their weekdays, Monday first", () => {
    const sheets = buildRoleDutySheets([
      duty({ title: "Rake bunkers", cadence: "weekly", days: ["fri", "mon", "wed"] }),
    ]);
    const groups = sheets[0].weekdays;
    expect(groups.map((g) => g.label)).toEqual(["Monday", "Wednesday", "Friday"]);
    for (const group of groups) {
      expect(group.duties.map((d) => d.title)).toEqual(["Rake bunkers"]);
    }
  });

  it("weekend days are supported", () => {
    const sheets = buildRoleDutySheets([
      duty({ title: "Clean & organize the work area", cadence: "weekly", days: ["sun", "sat"] }),
    ]);
    expect(sheets[0].weekdays.map((g) => g.label)).toEqual(["Saturday", "Sunday"]);
  });

  it("monthly and quarterly land in Monthly", () => {
    const sheets = buildRoleDutySheets([
      duty({ title: "Edge bunkers", cadence: "monthly" }),
      duty({ title: "Quarterly thing", cadence: "quarterly" }),
    ]);
    expect(sheets[0].monthly.map((d) => d.title)).toEqual(["Edge bunkers", "Quarterly thing"]);
  });

  it("dormant seeded duties classify by their note, not their placeholder cadence", () => {
    const sheets = buildRoleDutySheets([
      duty({
        title: "Repair bunker washouts after rain",
        cadence: "monthly",
        note: "As needed — no fixed schedule; do when required.",
      }),
      duty({
        title: "Core aerate greens",
        cadence: "annual",
        note: "Seasonal turf operation — schedule by hand each season.",
      }),
    ]);
    expect(sheets[0].asNeeded.map((d) => d.title)).toEqual(["Repair bunker washouts after rain"]);
    expect(sheets[0].seasonal.map((d) => d.title)).toEqual(["Core aerate greens"]);
    expect(sheets[0].monthly).toHaveLength(0);
  });

  it("annual without a note is seasonal; weekly without weekdays stays visible as daily", () => {
    const sheets = buildRoleDutySheets([
      duty({ title: "Winterize irrigation", cadence: "annual" }),
      duty({ title: "Weekly no-day duty", cadence: "weekly", days: [] }),
    ]);
    expect(sheets[0].seasonal.map((d) => d.title)).toEqual(["Winterize irrigation"]);
    expect(sheets[0].daily.map((d) => d.title)).toEqual(["Weekly no-day duty"]);
  });

  it("skips inactive duties and roles with nothing active", () => {
    const sheets = buildRoleDutySheets([
      duty({ title: "Old duty", is_active: false }),
      duty({ title: "Restaurant duty", role_group: "restaurant_staff", cadence: "daily" }),
    ]);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].role).toBe("restaurant_staff");
  });

  it("dedupes identical titles inside one bucket (old starter seed vs menu seed)", () => {
    const sheets = buildRoleDutySheets([
      duty({ title: "Rake bunkers", cadence: "weekly", days: ["mon"] }),
      duty({ title: "rake bunkers", cadence: "weekly", days: ["mon"] }),
    ]);
    expect(sheets[0].weekdays[0].duties).toHaveLength(1);
    expect(sheets[0].total).toBe(1);
  });

  it("orders sheets by the canonical role order", () => {
    const sheets = buildRoleDutySheets([
      duty({ title: "GM duty", role_group: "general_manager", cadence: "daily" }),
      duty({ title: "Rec duty", role_group: "recreation_aide", cadence: "daily" }),
    ]);
    expect(sheets.map((s) => s.role)).toEqual<DutyRoleGroup[]>([
      "recreation_aide",
      "general_manager",
    ]);
  });
});

describe("buildRoleDutySheetsHtml", () => {
  it("renders one sheet per role with headings and escaped titles", () => {
    const html = buildRoleDutySheetsHtml([
      duty({ title: "Mow <b>greens</b> & collars", cadence: "daily", role_group: "maintenance_staff" }),
      duty({ title: "Stock carts", cadence: "daily", role_group: "recreation_aide" }),
    ], new Date(2026, 6, 22));
    expect(html).toContain("Maintenance Staff");
    expect(html).toContain("Recreation Aides");
    expect(html).toContain("Every day");
    expect(html).toContain("Mow &lt;b&gt;greens&lt;/b&gt; &amp; collars");
    expect(html).not.toContain("<b>greens</b>");
    expect(html).toContain("July 22, 2026");
    expect((html.match(/class="sheet"/g) ?? []).length).toBe(2);
  });

  it("explains the empty state instead of printing a blank page", () => {
    const html = buildRoleDutySheetsHtml([], new Date(2026, 6, 22));
    expect(html).toContain("No active duties are recorded yet");
  });
});
