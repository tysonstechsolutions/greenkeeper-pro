import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const lines = readFileSync(join(__dirname, "..", "fixtures", "sales", "bar-flash-aug25-sep26.txt"), "utf8").split("\n");

const api = vi.hoisted(() => ({ callApi: vi.fn() }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/pdf/text-lines", () => ({ pdfTextLines: async () => lines }));
vi.mock("@/lib/supabase/storage", () => ({ uploadPhoto: async () => ({ storagePath: "u1/bar.pdf" }) }));
const db = vi.hoisted(() => ({
  existing: [] as { amount: number }[],
  deletes: [] as { table: string; filters: string[] }[],
  inserted: [] as Record<string, unknown>[],
  rows: new Map<string, Record<string, unknown>[]>(),
}));
vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: async () => db.existing,
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
  db.existing = [{ amount: 100 }, { amount: 50 }];
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
});
