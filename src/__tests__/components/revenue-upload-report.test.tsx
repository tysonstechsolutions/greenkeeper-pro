import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ callApi: vi.fn() }));
const rest = vi.hoisted(() => ({ directInsertRows: vi.fn() }));
vi.mock("@/lib/api/client", () => api);
vi.mock("@/lib/supabase/rest", () => rest);
vi.mock("@/lib/supabase/storage", () => ({ uploadPhoto: async () => ({ storagePath: "u/report.pdf" }) }));

import { UploadReportCard } from "@/app/revenue/upload-report";

beforeEach(() => {
  api.callApi.mockReset().mockResolvedValue({
    report_date: "2026-09-30",
    lines: [
      { category: "food_beverage", label: "BURGERS", amount: 500 },
      { category: "other", label: "DRAFT BEER", amount: 300 },
    ],
    report_total: 800,
  });
  rest.directInsertRows.mockReset().mockResolvedValue([]);
});

async function upload(area: RegExp) {
  render(<UploadReportCard userId="u1" onSaved={() => {}} />);
  expect(screen.getByRole("button", { name: /Pick the report type first/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: area }));
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "report.pdf", { type: "application/pdf" })] } });
  await screen.findByText(/matches the report's \$800\.00/);
  fireEvent.click(screen.getByRole("button", { name: /Save 2 entries/ }));
  await waitFor(() => expect(rest.directInsertRows).toHaveBeenCalled());
  return rest.directInsertRows.mock.calls[0][1] as Record<string, unknown>[];
}

describe("RecTrac report upload", () => {
  it("a bar report saves every line as Bar", async () => {
    const rows = await upload(/^Bar$/);
    expect(rows.map((r) => [r.category, r.report_area])).toEqual([
      ["bar", "bar"],
      ["bar", "bar"],
    ]);
  });

  it("a restaurant report saves every line as restaurant (F&B)", async () => {
    const rows = await upload(/^Restaurant$/);
    expect(rows.every((r) => r.category === "food_beverage" && r.report_area === "restaurant")).toBe(true);
  });

  it("the F&B Manager only gets the Buckley's report types", () => {
    render(<UploadReportCard userId="u1" onSaved={() => {}} areas={["restaurant", "bar"]} />);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Restaurant", "Bar"]);
  });

  it("explains the database update when Bar isn't allowed yet", async () => {
    rest.directInsertRows.mockRejectedValue(new Error('new row violates check constraint "revenue_entries_category_check"'));
    render(<UploadReportCard userId="u1" onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /^Bar$/ }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "report.pdf", { type: "application/pdf" })] } });
    await screen.findByText(/matches the report/);
    fireEvent.click(screen.getByRole("button", { name: /Save 2 entries/ }));
    await screen.findByText(/Run the database update 20261007120000_bar_and_invoice_coding\.sql/);
  });
});
