import { describe, it, expect, vi } from "vitest";
import {
  fetchMonthlyBoardData,
  getMonthDateRange,
} from "@/lib/utils/monthly-board-data";

// ── Helper: build a mock Supabase client ──

function mockSupabase(overrides: Record<string, unknown> = {}) {
  const defaultChain = {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    then: undefined as unknown,
    data: [] as unknown[],
    error: null as unknown,
    count: 0,
  };

  // Each .from() call gets its own chain so tests can
  // override per-table responses via the `overrides` map.
  const from = vi.fn((table: string) => {
    const tableOverride = overrides[table];
    const chain = { ...defaultChain };

    // Allow overriding resolved data/error per table
    if (tableOverride && typeof tableOverride === "object") {
      const o = tableOverride as { data?: unknown[]; error?: unknown; count?: number };
      chain.data = o.data ?? [];
      chain.error = o.error ?? null;
      chain.count = o.count ?? 0;
    }

    // Make every chainable method return a promise-like that resolves to {data, error, count}
    const proxyHandler: ProxyHandler<typeof chain> = {
      get(_target, prop) {
        if (prop === "then") {
          // Make the chain thenable (Promise.all support)
          return (
            resolve: (v: unknown) => void,
            reject: (e: unknown) => void
          ) =>
            Promise.resolve({
              data: chain.data,
              error: chain.error,
              count: chain.count,
            }).then(resolve, reject);
        }
        // All method calls return the proxy itself for chaining
        return vi.fn(() => new Proxy(chain, proxyHandler));
      },
    };

    return new Proxy(chain, proxyHandler);
  });

  return { from } as unknown as Parameters<typeof fetchMonthlyBoardData>[0];
}

// ── Tests ──

describe("getMonthDateRange", () => {
  it("returns correct date range for February 2026", () => {
    const { startDate, endDate } = getMonthDateRange(2, 2026);
    expect(startDate).toBe("2026-02-01");
    expect(endDate).toBe("2026-02-28");
  });

  it("returns correct date range for leap year February", () => {
    const { startDate, endDate } = getMonthDateRange(2, 2028);
    expect(startDate).toBe("2028-02-01");
    expect(endDate).toBe("2028-02-29");
  });

  it("returns correct date range for December", () => {
    const { startDate, endDate } = getMonthDateRange(12, 2025);
    expect(startDate).toBe("2025-12-01");
    expect(endDate).toBe("2025-12-31");
  });
});

describe("fetchMonthlyBoardData", () => {
  it("returns zeroed/null data when all queries return empty", async () => {
    const supabase = mockSupabase();
    const result = await fetchMonthlyBoardData(supabase, {
      month: 3,
      year: 2026,
    });

    expect(result.period).toEqual({
      month: 3,
      year: 2026,
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });
    expect(result.tasks.totalCreated).toBe(0);
    expect(result.tasks.completionRate).toBe(0);
    expect(result.labor.totalScheduledShifts).toBe(0);
    expect(result.weather.avgHighF).toBeNull();
    expect(result.budget.totalExpenses).toBeNull();
  });

  it("handles query errors gracefully (returns 0/null)", async () => {
    const supabase = mockSupabase({
      tasks: { error: new Error("connection refused"), data: null },
      schedule: { error: new Error("table missing"), data: null },
      weather_logs: { error: new Error("timeout"), data: null },
    });

    const result = await fetchMonthlyBoardData(supabase, {
      month: 1,
      year: 2026,
    });

    // Should not throw; all sections return defaults
    expect(result.tasks.totalCreated).toBe(0);
    expect(result.labor.totalScheduledShifts).toBe(0);
    expect(result.weather.avgHighF).toBeNull();
  });

  it("computes completion rate correctly", async () => {
    const taskRows = [
      { id: "1", status: "completed", due_date: "2026-04-05", completed_at: "2026-04-05" },
      { id: "2", status: "completed", due_date: "2026-04-10", completed_at: "2026-04-10" },
      { id: "3", status: "verified", due_date: "2026-04-08", completed_at: "2026-04-08" },
      { id: "4", status: "pending", due_date: "2026-04-20", completed_at: null },
    ];

    const supabase = mockSupabase({
      tasks: { data: taskRows, error: null },
    });

    const result = await fetchMonthlyBoardData(supabase, {
      month: 4,
      year: 2026,
    });

    // 3 completed/verified out of 4 = 75%
    expect(result.tasks.totalCreated).toBe(4);
    expect(result.tasks.totalCompleted).toBe(3);
    expect(result.tasks.completionRate).toBe(75);
  });
});
