import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "../utils/test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/restaurant/inventory-values",
  useSearchParams: () => new URLSearchParams(""),
}));
const auth = vi.hoisted(() => ({ isFbManager: false }));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ profile: { id: "gm1", role: auth.isFbManager ? "fb_manager" : "gm" }, user: { id: "gm1" }, isFbManager: auth.isFbManager }),
}));
vi.mock("@/components/auth/role-guard", async () => {
  const actual = await vi.importActual<typeof import("@/components/auth/role-guard")>("@/components/auth/role-guard");
  return { ...actual, RoleGuard: ({ children }: { children: React.ReactNode }) => <>{children}</> };
});

const db = vi.hoisted(() => ({
  saved: [] as Record<string, unknown>[],
  deletes: [] as string[][],
  inserted: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: async () => db.saved,
  directDeleteByFilter: async (_t: string, filters: string[]) => {
    db.deletes.push(filters);
  },
  directInsertRow: async (_t: string, row: Record<string, unknown>) => {
    db.inserted.push(row);
    return { id: `v${db.inserted.length}` };
  },
  directInsertRows: async (_t: string, rows: Record<string, unknown>[]) => {
    db.lines.push(...rows);
    return rows;
  },
}));

import InventoryValuesPage from "@/app/restaurant/inventory-values/page";

const FIXTURES = join(__dirname, "..", "fixtures", "inventory");
const file = (fixture: string, name: string) =>
  new File([readFileSync(join(FIXTURES, fixture))], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

beforeEach(() => {
  db.saved = [{ id: "old", outlet: "bar", month_end: "2026-09-30", total: 2089.97, stated_total: 2089.97, item_count: 70, source_file: "x" }];
  db.deletes = [];
  db.inserted = [];
  db.lines = [];
  auth.isFbManager = false;
});

describe("Month-End Inventory", () => {
  it("previews the counts, explains a short TOTAL, and saves with items", async () => {
    render(<InventoryValuesPage />);
    await screen.findByText("$2,089.97");
    fireEvent.change(screen.getByLabelText("Inventory count spreadsheets"), {
      target: {
        files: [
          file("sep-bar.xlsx", "SEP - 20091 (151120) - BUCKLEYS BAR.xlsx"),
          file("jun-bar-empty.xlsx", "JUN - 20091 (151120) - BUCKLEYS BAR.xlsx"),
        ],
      },
    });
    await screen.findByText(/Ready to import 1 month-end count/);
    expect(screen.getByText("$2,594.78")).toBeInTheDocument();
    expect(screen.getByText(/replaces the saved count/)).toBeInTheDocument();
    expect(screen.getByText(/sheet's TOTAL shows \$2,089\.97/)).toBeInTheDocument();
    expect(screen.getByText(/Not counted \(empty sheet, left out\): Buckley's bar Jun 2026/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save 1 count/ }));
    await screen.findByText(/Saved 1 month-end count\./);
    expect(db.deletes).toEqual([["outlet=eq.bar", "month_end=eq.2026-09-30"]]);
    expect(db.inserted[0]).toMatchObject({ outlet: "bar", month_end: "2026-09-30", total: 2594.78, stated_total: 2089.97, account: "151120" });
    expect(db.lines.length).toBe(db.inserted[0].item_count);
    expect(db.lines.every((l) => l.valuation_id === "v1")).toBe(true);
  });

  it("shows the F&B Manager food and bar only", async () => {
    auth.isFbManager = true;
    render(<InventoryValuesPage />);
    await screen.findByText("$2,089.97");
    expect(screen.queryByText("Pro shop retail")).toBeNull();
    expect(screen.getByText("Buckley's bar")).toBeInTheDocument();
  });
});
