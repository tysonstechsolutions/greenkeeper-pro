import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const text = vi.fn();
  const jsPDF = vi.fn(function () {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      setFillColor: vi.fn(),
      rect: vi.fn(),
      setFont: vi.fn(),
      setFontSize: vi.fn(),
      setTextColor: vi.fn(),
      text,
      setDrawColor: vi.fn(),
      roundedRect: vi.fn(),
      addPage: vi.fn(),
      setLineWidth: vi.fn(),
      line: vi.fn(),
      splitTextToSize: (content: string) => [content],
      getNumberOfPages: () => 2,
      setPage: vi.fn(),
      output: () => new Blob(),
    };
  });
  const createClient = vi.fn();
  const getCachedUser = vi.fn();

  return { text, jsPDF, createClient, getCachedUser };
});

vi.mock("jspdf", () => ({ jsPDF: mocks.jsPDF }));
vi.mock("@/lib/supabase/client", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/rest", () => ({ getCachedUser: mocks.getCachedUser }));

import { generateMonthlyBoardReport } from "@/lib/reports/monthly-board-report";

function mockSupabase(overrides: Record<string, unknown> = {}) {
  const from = vi.fn((table: string) => {
    const tableOverride = overrides[table] as
      | { data?: unknown[] | null; error?: unknown; count?: number | null }
      | undefined;
    const result = {
      data: tableOverride?.data ?? [],
      error: tableOverride?.error ?? null,
      count: tableOverride?.count ?? 0,
    };

    let proxy: object;
    proxy = new Proxy({}, {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: (value: typeof result) => void) =>
            Promise.resolve(result).then(resolve);
        }
        return vi.fn(() => proxy);
      },
    });
    return proxy;
  });

  return { supabase: { from }, from };
}

describe("generateMonthlyBoardReport", () => {
  it("renders scheduled shifts from schedules without changing task metrics", async () => {
    const { supabase, from } = mockSupabase({
      profiles: { data: [{ full_name: "Board User", role: "gm" }] },
      schedules: {
        data: [
          { id: "shift-1", user_id: "crew-1" },
          { id: "shift-2", user_id: "crew-2" },
          { id: "shift-3", user_id: "crew-1" },
        ],
      },
      tasks: {
        data: [
          { id: "task-1", status: "completed", due_date: "2026-03-10" },
          { id: "task-2", status: "pending", due_date: "2026-03-31" },
        ],
      },
    });
    mocks.createClient.mockReturnValue(supabase);
    mocks.getCachedUser.mockReturnValue({ id: "user-1", email: "board@example.com" });

    const report = await generateMonthlyBoardReport({ month: 3, year: 2026 });
    const renderedText = mocks.text.mock.calls.map(([content]) =>
      Array.isArray(content) ? content.join("\n") : String(content),
    );

    expect(report.filename).toBe("vmgc-board-report-2026-03.pdf");
    expect(from).toHaveBeenCalledWith("schedules");
    expect(from).not.toHaveBeenCalledWith("schedule");
    expect(renderedText).toEqual(expect.arrayContaining([
      "LABOR",
      "3",
      "scheduled shifts · 2 crew members",
      "TASKS",
      "2",
      "1 completed (50%) · 0 overdue",
    ]));
  });
});
