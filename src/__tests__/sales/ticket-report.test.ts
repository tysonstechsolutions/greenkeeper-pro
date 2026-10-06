import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planFlashImport, revenueRows } from "@/lib/sales/import";
import { isTicketReport, parseTicketReport, ticketsAsFlash, TICKET_CATEGORY, wednesdayOnOrAfter } from "@/lib/sales/ticket-report";

const lines = readFileSync(join(__dirname, "..", "fixtures", "sales", "reception-tickets-feb-oct26.txt"), "utf8").split("\n");

describe("RecTrac ticket report (graduation receptions)", () => {
  const r = parseTicketReport(lines)!;

  it("reads every ticket and matches the report's own totals exactly", () => {
    expect(isTicketReport(lines)).toBe(true);
    expect(r.mismatches).toEqual([]);
    expect(r).toMatchObject({
      title: "Graduate Family Welcome Reception tickets",
      runDate: "2026-10-06",
      grandCount: 2102,
      grandFees: 21010,
      transactions: 772,
      ticketsWithTransaction: 39,
    });
    expect(r.sales).toHaveLength(2102);
    expect(r.sales[0]).toEqual({ ticketCode: "MA7009-16-166-001", date: "2026-02-11", receipt: "8560485", user: "WWWMIDLANT", serial: "00001", fee: 10, discount: 0, net: 10 });
  });

  it("groups tickets into the 39 receptions", () => {
    expect(r.events).toHaveLength(39);
    expect(r.events[0]).toEqual({
      ticketCode: "MA7009-16-166-001",
      description: "Graduate Family Welcome Reception",
      tickets: 11,
      total: 110,
      firstSale: "2026-02-11",
      lastSale: "2026-02-18",
      likelyDate: "2026-02-18",
    });
    // Its lines run over a page break, where the code is printed again.
    expect(r.events.find((e) => e.ticketCode === "MA7009-16-166-003")!.tickets).toBe(42);
    expect(r.events.find((e) => e.ticketCode === "MA7009-16-166-031")).toMatchObject({ tickets: 125, total: 1250, likelyDate: "2026-09-30" });
  });

  it("notes the one ticket whose fee doesn't match what was paid", () => {
    expect(r.notes).toEqual([
      "1 ticket shows a fee that doesn't match the net paid (MA7009-16-166-038 #00018 on 2026-09-30: fee $0.00, net $10.00). Sales use the net paid, so they come to $10.00 more than the report's fee total.",
    ]);
  });

  it("saves as restaurant sales by the day each ticket was bought", () => {
    const flash = ticketsAsFlash(r);
    expect(flash).toMatchObject({ category: TICKET_CATEGORY, begin: "2026-02-11", end: "2026-10-06", grandTotal: 21020, mismatches: [] });
    const plan = planFlashImport(flash, "restaurant");
    expect(plan.total).toBe(21020);
    expect(plan.months).toEqual([
      { month: "2026-02", total: 430 },
      { month: "2026-03", total: 2070 },
      { month: "2026-04", total: 2000 },
      { month: "2026-05", total: 2730 },
      { month: "2026-06", total: 2070 },
      { month: "2026-07", total: 2210 },
      { month: "2026-08", total: 3380 },
      { month: "2026-09", total: 5470 },
      { month: "2026-10", total: 660 },
    ]);
    expect(plan.itemDays[0]).toEqual({
      sale_date: "2026-02-11",
      inventory_code: "MA7009-16-166-001",
      description: "Graduate Family Welcome Reception ticket",
      qty: 2,
      gross: 20,
      discount: 0,
      net: 20,
    });
    expect(revenueRows(plan, "rep", "u1", "Reception tickets")[0]).toMatchObject({
      entry_date: "2026-02-11",
      category: "food_beverage",
      amount: 20,
      description: "Reception tickets (2 sold)",
      sales_report_id: "rep",
    });
  });

  it("catches a ticket code that doesn't add up", () => {
    const bent = lines.map((l) => (l.trim() === "11 110 0.00" ? "12 120 0.00" : l));
    expect(parseTicketReport(bent)!.mismatches).toEqual([
      "MA7009-16-166-001: 11 tickets for $110.00 read, the report's total is 12 for $120.00",
    ]);
  });

  it("is not some other report", () => {
    expect(parseTicketReport(["Flash Report Part 1 - Sales Statistics"])).toBeNull();
  });

  it("finds the Wednesday on or after a date", () => {
    expect(wednesdayOnOrAfter("2026-03-31")).toBe("2026-04-01");
    expect(wednesdayOnOrAfter("2026-04-01")).toBe("2026-04-01");
    expect(wednesdayOnOrAfter("2026-04-02")).toBe("2026-04-08");
  });
});
