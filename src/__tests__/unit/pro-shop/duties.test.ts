import { describe, it, expect } from "vitest";
import {
  dutyDayFlags,
  summarizeDutyDays,
  groupDuties,
  buildDutiesPrintHtml,
} from "@/lib/pro-shop/duties";
import type { ProShopDuty, ProShopStaff } from "@/lib/pro-shop/types";

function duty(p: Partial<ProShopDuty>): ProShopDuty {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    title: p.title ?? "Duty",
    area: p.area ?? null,
    staff_id: p.staff_id ?? null,
    days: p.days ?? [],
    note: p.note ?? null,
    is_active: p.is_active ?? true,
    sort_order: p.sort_order ?? 0,
  };
}

function staff(id: string, name: string, sort: number): ProShopStaff {
  return {
    id,
    full_name: name,
    position: "rec_aid",
    default_group: "outside",
    availability_text: null,
    availability: {},
    flex: true,
    phone: null,
    is_active: true,
    sort_order: sort,
    notes: null,
  };
}

describe("dutyDayFlags", () => {
  it("maps weekday keys to 7 booleans sun..sat", () => {
    expect(dutyDayFlags(["mon", "wed", "fri"])).toEqual([
      false, true, false, true, false, true, false,
    ]);
  });
  it("is all-false for no days", () => {
    expect(dutyDayFlags([])).toEqual([false, false, false, false, false, false, false]);
  });
});

describe("summarizeDutyDays", () => {
  it("lists days in week order", () => {
    expect(summarizeDutyDays(["fri", "mon", "wed"])).toBe("Mon · Wed · Fri");
  });
  it("says Daily when all seven are set", () => {
    expect(summarizeDutyDays(["sun", "mon", "tue", "wed", "thu", "fri", "sat"])).toBe("Daily");
  });
  it("handles the empty case", () => {
    expect(summarizeDutyDays([])).toBe("No days set");
  });
});

describe("groupDuties", () => {
  const sam = staff("s1", "Sam Rivera", 1);
  const ana = staff("s2", "Ana Diaz", 2);

  it("orders sections: outside, inside, both, then people; drops empties", () => {
    const duties = [
      duty({ title: "Vacuum", area: "outside", days: ["mon", "wed"], sort_order: 0 }),
      duty({ title: "Count register", area: "inside", days: ["sat"], sort_order: 0 }),
      duty({ title: "Lock up", area: "both", days: ["sun"], sort_order: 0 }),
      duty({ title: "Water plants", staff_id: "s2", days: ["tue"], sort_order: 0 }),
    ];
    const sections = groupDuties(duties, [sam, ana]);
    expect(sections.map((s) => s.label)).toEqual([
      "Rec Aids (Outside)",
      "Golf Ops (Inside)",
      "Both areas",
      "Ana Diaz",
    ]);
  });

  it("sorts duties inside a section by sort_order then title", () => {
    const duties = [
      duty({ title: "Zebra", area: "outside", sort_order: 1 }),
      duty({ title: "Apple", area: "outside", sort_order: 1 }),
      duty({ title: "First", area: "outside", sort_order: 0 }),
    ];
    const [outside] = groupDuties(duties, []);
    expect(outside.duties.map((d) => d.title)).toEqual(["First", "Apple", "Zebra"]);
  });

  it("groups multiple duties under the same person", () => {
    const duties = [
      duty({ title: "Table up", staff_id: "s1", days: ["wed"] }),
      duty({ title: "Table down", staff_id: "s1", days: ["thu"] }),
    ];
    const sections = groupDuties(duties, [sam]);
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBe("Sam Rivera");
    expect(sections[0].duties).toHaveLength(2);
  });

  it("skips inactive duties", () => {
    const duties = [duty({ title: "Old", area: "outside", is_active: false })];
    expect(groupDuties(duties, [])).toEqual([]);
  });
});

describe("buildDutiesPrintHtml", () => {
  it("renders a heading + table row per section/duty", () => {
    const sections = groupDuties(
      [duty({ title: "Vacuum", area: "outside", days: ["mon", "wed"], note: "AM" })],
      [],
    );
    const html = buildDutiesPrintHtml(sections);
    expect(html).toContain("<h2>Rec Aids (Outside)</h2>");
    expect(html).toContain("Vacuum");
    expect(html).toContain("Mon · Wed");
    expect(html).toContain("AM");
  });

  it("escapes HTML in titles/notes", () => {
    const sections = groupDuties(
      [duty({ title: "Tidy <shelves> & racks", area: "inside", days: ["fri"] })],
      [],
    );
    const html = buildDutiesPrintHtml(sections);
    expect(html).toContain("Tidy &lt;shelves&gt; &amp; racks");
    expect(html).not.toContain("<shelves>");
  });

  it("handles no duties", () => {
    expect(buildDutiesPrintHtml([])).toBe("<p>No duties yet.</p>");
  });
});
