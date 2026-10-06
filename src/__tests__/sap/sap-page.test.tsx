import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { TextPiece } from "@/lib/pdf/text-lines";
import { parseBudgetReport } from "@/lib/sap/budget-report";
import { budgetLineRows } from "@/lib/sap/budget-store";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/budget/sap",
  useSearchParams: () => new URLSearchParams(""),
}));
const auth = vi.hoisted(() => ({ role: "gm" }));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    profile: { id: "u1", role: auth.role },
    loading: false,
    isFbManager: auth.role === "fb_manager",
  }),
}));
vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return { ...actual, RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

const pages = JSON.parse(readFileSync(join(__dirname, "..", "fixtures", "sap", "budget-pages.json"), "utf8")) as TextPiece[][];
vi.mock("@/lib/pdf/text-lines", () => ({ pdfTextPages: async () => pages }));

const db = vi.hoisted(() => ({
  reports: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  filters: [] as string[],
  calls: [] as string[],
  failReports: false,
}));
vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: async (table: string, opts: { filters?: string[] }) => {
    if (table !== "sap_budget_reports") return [];
    if (db.failReports) throw new Error('relation "public.sap_budget_reports" does not exist');
    const f = opts.filters ?? [];
    return db.reports.filter((r) => f.every((x) => String(r[x.split("=")[0]]) === x.split("eq.")[1]));
  },
  directSelectAll: async (table: string, opts: { filters?: string[] }) => {
    db.filters = opts.filters ?? [];
    const id = db.filters[0]?.replace("report_id=eq.", "");
    const only = db.filters.find((f) => f.startsWith("cost_center=in."))?.slice("cost_center=in.(".length, -1).split(",");
    return table === "sap_budget_lines" ? db.lines.filter((l) => l.report_id === id && (!only || only.includes(String(l.cost_center)))) : [];
  },
  directDeleteRow: async (table: string, _col: string, id: string) => {
    db.calls.push(`delete ${table} ${id}`);
    db.reports = db.reports.filter((r) => r.id !== id);
    db.lines = db.lines.filter((l) => l.report_id !== id);
  },
  directInsertRow: async (table: string, row: Record<string, unknown>) => {
    db.calls.push(`insert ${table}`);
    const saved = { ...row, id: "new" };
    db.reports.push(saved);
    return saved;
  },
  directInsertRows: async (table: string, rows: Record<string, unknown>[]) => {
    db.calls.push(`insert ${table} ${rows.length}`);
    db.lines.push(...rows);
    return rows;
  },
}));

const report = parseBudgetReport(pages)!;

beforeEach(() => {
  auth.role = "gm";
  db.reports = [];
  db.lines = [];
  db.filters = [];
  db.calls = [];
  db.failReports = false;
});

async function renderPage() {
  const { default: Page } = await import("@/app/budget/sap/page");
  return render(<Page />);
}

const tile = (label: string) => screen.getByText(label).closest(".gk-card")!.textContent;

describe("SAP Report page", () => {
  it("reads an uploaded report, checks it, saves it, and shows it", async () => {
    await renderPage();
    expect(await screen.findByText(/No SAP reports saved yet/)).toBeTruthy();
    const input = screen.getByLabelText("SAP report PDF") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "sap.pdf", { type: "application/pdf" })] } });
    expect(await screen.findByText(/Every cost center checks out/)).toBeTruthy();
    expect(screen.getByText(/September · period 12 of FY26/)).toBeTruthy();
    expect(screen.getByText(/2 cost centers: Pro shop merchandise, Buckley's food & bar/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    await screen.findByRole("tab", { name: "Buckley's food & bar" });
    const lineCount = report.blocks.reduce((s, b) => s + b.lines.length, 0);
    expect(db.calls).toEqual(["insert sap_budget_reports", `insert sap_budget_lines ${lineCount}`]);
    expect(db.reports[0]).toMatchObject({ fiscal_year: 2026, period: 12, source_file: "sap.pdf" });

    // Year to date for the first cost center (pro shop merchandise).
    expect(tile("Money in (revenue)")).toContain("$20,954");
    fireEvent.click(screen.getByRole("tab", { name: "Buckley's food & bar" }));
    expect(tile("Profit / loss")).toContain("−$67,341");
    expect(tile("Profit / loss")).toContain("Plan $73,729");
    expect(tile("Self-sufficiency")).toContain("57%");
    expect(tile("Self-sufficiency")).toContain("70 pts under");
    expect(tile("Money out (expense)")).toContain("$111,380 under");
    expect(screen.getByText("Food").closest(".gk-card")!.textContent).toContain("59.4%");
    expect(screen.getByText("Bar").closest(".gk-card")!.textContent).toContain("41.7%");

    const row = within(screen.getByRole("table", { name: "Report lines" })).getByText("RESALE REVENUE FOOD").closest("tr")!;
    expect(row.textContent).toBe("RESALE REVENUE FOOD301110$28,765$179,800−$151,035$34,372");

    // This month: September cost of goods wasn't posted.
    fireEvent.click(screen.getByRole("button", { name: "September" }));
    expect(screen.getByText("Food").closest(".gk-card")!.textContent).toContain("No cost posted yet");
  });

  it("replaces the same month when it's saved again", async () => {
    db.reports = [{ id: "old", fiscal_year: 2026, period: 12, period_name: "September", run_date: "2026-10-01" }];
    db.lines = budgetLineRows(report, "old");
    await renderPage();
    await screen.findByRole("tab", { name: "Pro shop merchandise" });
    fireEvent.change(screen.getByLabelText("SAP report PDF"), { target: { files: [new File(["x"], "sap.pdf")] } });
    expect(await screen.findByText(/Replaces the September report already saved \(run 2026-10-01\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save report" }));
    await waitFor(() => expect(db.calls[0]).toBe("delete sap_budget_reports old"));
    await waitFor(() => expect(db.reports.map((r) => r.id)).toEqual(["new"]));
  });

  it("won't save a report whose numbers don't add up", async () => {
    const bent = pages.map((p) => p.map((x) => (x.str.trim() === "67,341-" ? { ...x, str: "67,000-" } : x)));
    pages.splice(0, pages.length, ...bent);
    try {
      await renderPage();
      fireEvent.change(await screen.findByLabelText("SAP report PDF"), { target: { files: [new File(["x"], "sap.pdf")] } });
      expect(await screen.findByText(/can't be saved/)).toBeTruthy();
      expect((screen.getByRole("button", { name: "Save report" }) as HTMLButtonElement).disabled).toBe(true);
    } finally {
      const fixed = pages.map((p) => p.map((x) => (x.str.trim() === "67,000-" ? { ...x, str: "67,341-" } : x)));
      pages.splice(0, pages.length, ...fixed);
    }
  });

  it("shows the F&B Manager Buckley's only, with no upload", async () => {
    auth.role = "fb_manager";
    db.reports = [{ id: "r1", fiscal_year: 2026, period: 12, period_name: "September", run_date: "2026-10-06" }];
    db.lines = budgetLineRows(report, "r1");
    await renderPage();
    expect(await screen.findByText("Buckley's food & bar")).toBeTruthy();
    expect(db.filters).toContain("cost_center=in.(20091,1353-5247)");
    expect(screen.queryByRole("tab", { name: "Pro shop merchandise" })).toBeNull();
    expect(screen.queryByText("Add an SAP report")).toBeNull();
  });

  it("says when the database update hasn't been run", async () => {
    db.failReports = true;
    await renderPage();
    expect(await screen.findByText(/database update for SAP reports hasn't been run yet/)).toBeTruthy();
  });
});
