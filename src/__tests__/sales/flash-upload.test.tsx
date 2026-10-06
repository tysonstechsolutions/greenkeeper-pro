import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "fixtures", "sales", name), "utf8").split("\n");
const pdf = vi.hoisted(() => ({ lines: [] as string[] }));

const api = vi.hoisted(() => ({ callApi: vi.fn() }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/pdf/text-lines", () => ({ pdfTextLines: async () => pdf.lines }));
vi.mock("@/lib/supabase/storage", () => ({ uploadPhoto: async () => ({ storagePath: "u1/bar.pdf" }) }));
const db = vi.hoisted(() => ({
  existing: [] as { amount: number }[],
  /** Saved ticket reports (sales_reports with the ticket category). */
  ticketReports: [] as { id: string; begin_date: string; end_date: string; grand_total: number }[],
  selects: [] as { table: string; filters: string[] }[],
  deletes: [] as { table: string; filters: string[] }[],
  inserted: [] as Record<string, unknown>[],
  rows: new Map<string, Record<string, unknown>[]>(),
}));
vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: async (table: string, opts: { filters?: string[] }) => {
    db.selects.push({ table, filters: opts.filters ?? [] });
    return table === "sales_reports" ? db.ticketReports : db.existing;
  },
  directDeleteByFilter: async (table: string, filters: string[]) => {
    db.deletes.push({ table, filters });
  },
  directInsertRow: async (_t: string, row: Record<string, unknown>) => {
    db.inserted.push(row);
    return { id: "rep1" };
  },
  directInsertRows: async (table: string, rows: Record<string, unknown>[]) => {
    db.rows.set(table, [...(db.rows.get(table) ?? []), ...rows]);
    return rows;
  },
}));

import { UploadReportCard } from "@/app/revenue/upload-report";

beforeEach(() => {
  pdf.lines = fixture("bar-flash-aug25-sep26.txt");
  db.existing = [{ amount: 100 }, { amount: 50 }];
  db.ticketReports = [];
  db.selects = [];
  db.deletes = [];
  db.inserted = [];
  db.rows = new Map();
  api.callApi.mockReset();
});

describe("uploading a RecTrac flash report", () => {
  it("reads it exactly, shows the check, and replaces those days", async () => {
    const onSaved = vi.fn();
    render(<UploadReportCard userId="u1" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Bar$/ }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "bar_sales.pdf", { type: "application/pdf" })] } });

    await screen.findByText(/\$22,200\.25 over 246 days — matches the report's grand total and every daily total/);
    expect(api.callApi).not.toHaveBeenCalled();
    expect(await screen.findByText(/2 buckley's bar revenue entries already on these dates \(\$150\.00\) will be replaced/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save 246 days of sales/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.deletes.map((d) => d.table)).toEqual(["revenue_entries", "sales_item_days", "sales_reports"]);
    expect(db.deletes[0].filters).toEqual(["category=eq.bar", "entry_date=gte.2025-08-01", "entry_date=lte.2026-09-30"]);
    expect(db.inserted[0]).toMatchObject({ outlet: "bar", begin_date: "2025-08-01", end_date: "2026-09-30", grand_total: 22200.25, transactions: 1971 });
    const revenue = db.rows.get("revenue_entries")!;
    expect(revenue).toHaveLength(246);
    expect(revenue[0]).toMatchObject({ category: "bar", sales_report_id: "rep1", report_path: "u1/bar.pdf", report_area: "bar" });
    const items = db.rows.get("sales_item_days")!;
    expect(items.every((i) => i.report_id === "rep1" && i.outlet === "bar")).toBe(true);
    expect(await screen.findByText(/Saved Buckley's bar sales Aug 1, 2025 – Sep 30, 2026: \$22,200\.25 over 246 days\./)).toBeInTheDocument();
  });

  it("warns when the picked report type doesn't match the report", async () => {
    render(<UploadReportCard userId="u1" onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Restaurant$/ }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "bar_sales.pdf", { type: "application/pdf" })] } });
    await screen.findByText(/looks like bar sales, but you picked restaurant/);
  });

  it("leaves reception ticket sales alone when a restaurant report replaces those days", async () => {
    pdf.lines = fixture("restaurant-flash-aug5-excerpt.txt");
    db.ticketReports = [{ id: "t1", begin_date: "2026-02-11", end_date: "2026-10-06", grand_total: 21020 }];
    const onSaved = vi.fn();
    render(<UploadReportCard userId="u1" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Restaurant$/ }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "sales.pdf", { type: "application/pdf" })] } });
    fireEvent.click(await screen.findByRole("button", { name: /Save \d+ days? of sales/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.deletes[0].filters).toContain("or=(sales_report_id.is.null,sales_report_id.not.in.(t1))");
    expect(db.deletes[1].filters).toContain("report_id=not.in.(t1)");
    expect(db.deletes[2].filters).toContain("id=not.in.(t1)");
  });
});

describe("uploading a reception ticket report", () => {
  beforeEach(() => {
    pdf.lines = fixture("reception-tickets-feb-oct26.txt");
  });

  it("reads every ticket, checks it, and saves it as restaurant sales", async () => {
    const onSaved = vi.fn();
    render(<UploadReportCard userId="u1" onSaved={onSaved} />);
    // Whatever report type was picked, tickets are the restaurant's.
    fireEvent.click(screen.getByRole("radio", { name: /^Bar$/ }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "Reception_Ticket_sales.pdf", { type: "application/pdf" })] } });

    expect(await screen.findByText("Reception tickets · counted as Buckley's restaurant sales")).toBeInTheDocument();
    expect(screen.getByText(/2102 tickets for \$21,020\.00 across 39 receptions — matches every reception's total/)).toBeInTheDocument();
    expect(screen.getByText(/1 ticket shows a fee that doesn't match the net paid/)).toBeInTheDocument();
    expect(screen.getByText("Tickets by reception (39)")).toBeInTheDocument();
    expect(screen.queryByText(/looks like/)).toBeNull();
    expect(api.callApi).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Save \d+ days of sales/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // Nothing saved before: no restaurant sales are cleared.
    expect(db.deletes).toEqual([]);
    expect(db.inserted[0]).toMatchObject({ outlet: "restaurant", category: "Reception tickets", begin_date: "2026-02-11", end_date: "2026-10-06", grand_total: 21020, transactions: 772 });
    const revenue = db.rows.get("revenue_entries")!;
    expect(revenue.reduce((s, r) => s + Number(r.amount), 0)).toBe(21020);
    expect(revenue[0]).toMatchObject({ entry_date: "2026-02-11", category: "food_beverage", amount: 20, description: "Reception tickets (2 sold)", report_area: "restaurant" });
    expect(await screen.findByText(/Saved 2102 reception tickets \(39 receptions\) as restaurant sales: \$21,020\.00/)).toBeInTheDocument();
  });

  it("replaces only the ticket sales already saved for those days", async () => {
    db.ticketReports = [{ id: "t0", begin_date: "2026-02-11", end_date: "2026-09-15", grand_total: 15000 }];
    db.existing = [{ amount: 10 }, { amount: 20 }];
    const onSaved = vi.fn();
    render(<UploadReportCard userId="u1" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Restaurant$/ }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF"], "t.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText(/2 days of ticket sales already saved for these dates \(\$30\.00\) will be replaced/)).toBeInTheDocument();
    expect(db.selects.find((q) => q.table === "revenue_entries")!.filters[0]).toBe("sales_report_id=in.(t0)");
    fireEvent.click(screen.getByRole("button", { name: /Save \d+ days of sales/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(db.deletes).toEqual([
      { table: "revenue_entries", filters: ["sales_report_id=in.(t0)", "entry_date=gte.2026-02-11", "entry_date=lte.2026-10-06"] },
      { table: "sales_item_days", filters: ["report_id=in.(t0)", "sale_date=gte.2026-02-11", "sale_date=lte.2026-10-06"] },
      { table: "sales_reports", filters: ["id=in.(t0)", "begin_date=gte.2026-02-11", "end_date=lte.2026-10-06"] },
    ]);
  });
});
