import { describe, expect, it } from "vitest";
import { buildSchedulePrintHtml, printGrid } from "@/lib/pro-shop/print-schedule";
import { DEFAULT_SCHEDULE_SETTINGS, type CoverageRule, type ProShopShift, type ProShopStaff } from "@/lib/pro-shop/types";

function rules(): CoverageRule[] {
  const out: CoverageRule[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    out.push({
      id: `in-${weekday}`, area: "pro_shop", weekday, group: "inside",
      open_time: "06:00", close_time: "20:00", base_staff: 2, extra_staff: 0, extra_start: null,
    });
    out.push({
      id: `out-${weekday}`, area: "pro_shop", weekday, group: "outside",
      open_time: "08:00", close_time: "20:00", base_staff: 2, extra_staff: 0, extra_start: null,
    });
  }
  return out;
}

const staff: ProShopStaff[] = [
  { id: "mike", full_name: "Mike Pelletier", position: "golf_ops_assistant", default_group: "inside",
    availability_text: null, availability: {}, flex: false, phone: null, is_active: true,
    area: "pro_shop", sort_order: 0, notes: null },
  { id: "joe", full_name: "Joe Sordyl", position: "rec_aid", default_group: "outside",
    availability_text: null, availability: {}, flex: true, phone: null, is_active: true,
    area: "pro_shop", sort_order: 1, notes: null },
];

function shift(partial: Partial<ProShopShift> & { staff_id: string; shift_date: string }): ProShopShift {
  return {
    id: `${partial.staff_id}-${partial.shift_date}-${partial.start_time ?? "x"}`,
    schedule_id: "s", group: "inside", start_time: "06:00", end_time: "14:30",
    source: "template", note: null, ...partial,
  };
}

const base = {
  area: "pro_shop" as const, year: 2026, month0: 7,
  staff, rules: rules(), settings: DEFAULT_SCHEDULE_SETTINGS,
  generatedOn: new Date(2026, 7, 1, 9, 0, 0),
};

describe("printGrid", () => {
  it("pads to whole Sunday-start weeks around the month", () => {
    // 1 Aug 2026 is a Saturday, so the first week is six blanks then the 1st.
    const grid = printGrid(2026, 7);
    expect(grid.length % 7).toBe(0);
    expect(grid.slice(0, 6).every((d) => d === null)).toBe(true);
    expect(grid[6]).toBe("2026-08-01");
    expect(grid.filter((d) => d !== null)).toHaveLength(31);
  });
});

describe("buildSchedulePrintHtml", () => {
  const html = () => buildSchedulePrintHtml({
    ...base,
    shifts: [
      shift({ staff_id: "mike", shift_date: "2026-08-03", group: "inside", start_time: "06:00", end_time: "14:30" }),
      shift({ staff_id: "joe", shift_date: "2026-08-03", group: "outside", start_time: "08:00", end_time: "14:00" }),
    ],
    status: "draft" as const,
  });

  it("is a self-contained landscape page titled for the month", () => {
    const out = html();
    expect(out).toContain("<!doctype html>");
    expect(out).toContain("size: landscape");
    expect(out).toContain("Pro Shop Schedule");
    expect(out).toContain("August 2026");
    expect(out).not.toMatch(/<script|https?:\/\//);
  });

  it("prints each scheduled shift with its time and first name", () => {
    const out = html();
    expect(out).toContain("0600-1430");
    expect(out).toContain("Mike");
    expect(out).toContain("0800-1400");
    expect(out).toContain("Joe");
  });

  it("prints an unstaffed shift as a time plus a line to write a name on", () => {
    // Both groups want 2; only 1 each is scheduled, and neither covers the
    // whole window — so the day carries open shifts.
    const out = html();
    expect(out).toContain('class="s open');
    expect(out).toContain('class="blank"');
    expect(out).toMatch(/1430-2000|1400-2000/);
    expect(out).toContain("write your name on the line");
  });

  it("rules the name line solid, with room to write", () => {
    const out = html();
    expect(out).toMatch(/\.open \.blank \{[^}]*border-bottom: 1\.2px solid/);
    expect(out).not.toMatch(/\.open \.blank \{[^}]*dashed/);
    // Enough height and width for a handwritten first name.
    expect(out).toMatch(/\.open \.blank \{[^}]*height: 15px/);
    expect(out).toMatch(/\.open \.blank \{[^}]*min-width: 56px/);
  });

  it("colour-codes an open shift by the job it needs", () => {
    const out = html();
    // A rec aid shift and a golf ops shift carry different classes…
    expect(out).toContain('class="s open out"');
    expect(out).toContain('class="s open in"');
    // …and those classes are tinted and ruled in different colours.
    expect(out).toContain(".open.out { background: #fff3e0; }");
    expect(out).toContain(".open.in  { background: #e8eeff; }");
    expect(out).toContain(".open.out .blank { border-bottom-color: #7a4b00; }");
    expect(out).toContain(".open.in  .blank { border-bottom-color: #23408e; }");
  });

  it("keeps those backgrounds when the page is actually printed", () => {
    // Browsers drop background colour on print unless told otherwise, which
    // would strip the colour coding this sheet depends on.
    expect(html()).toMatch(/print-color-adjust:\s*exact/);
  });

  it("explains the colours in the legend", () => {
    const out = html();
    expect(out).toContain("Rec aid");
    expect(out).toContain("Golf ops assistant");
    expect(out).toContain("The colour says which job it is");
  });

  it("counts the open shifts in the header so the gap is not a surprise", () => {
    expect(html()).toMatch(/\d+ shifts still open/);
  });

  it("lists paid hours per person with the lunch already out", () => {
    const out = html();
    // Mike 06:00-14:30 is 8h30 on site and 8h paid.
    expect(out).toContain("Mike Pelletier");
    expect(out).toContain(">8<");
    expect(out).toContain("Hours this month");
    expect(out).toContain("unpaid lunch is already deducted");
  });

  it("says nothing is open when every day is fully staffed", () => {
    const shifts: ProShopShift[] = [];
    for (let d = 1; d <= 31; d++) {
      const date = `2026-08-${String(d).padStart(2, "0")}`;
      shifts.push(shift({ staff_id: "mike", shift_date: date, group: "inside", start_time: "06:00", end_time: "13:00" }));
      shifts.push(shift({ staff_id: "joe", shift_date: date, group: "inside", start_time: "13:00", end_time: "20:00" }));
      shifts.push(shift({ staff_id: "mike", shift_date: date, group: "outside", start_time: "08:00", end_time: "14:00" }));
      shifts.push(shift({ staff_id: "joe", shift_date: date, group: "outside", start_time: "14:00", end_time: "20:00" }));
    }
    const out = buildSchedulePrintHtml({ ...base, shifts });
    expect(out).not.toContain("still open");
    expect(out).not.toContain('class="s open');
  });

  it("escapes a name rather than letting it become markup", () => {
    const out = buildSchedulePrintHtml({
      ...base,
      staff: [{ ...staff[0], full_name: "<script>bad</script> Smith" }],
      shifts: [shift({ staff_id: "mike", shift_date: "2026-08-03" })],
    });
    expect(out).not.toContain("<script>bad");
    expect(out).toContain("&lt;script&gt;bad");
  });
});
