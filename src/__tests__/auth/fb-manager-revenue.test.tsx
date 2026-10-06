import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/revenue",
}));
const auth = vi.hoisted(() => ({ role: "fb_manager" }));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    profile: { id: "u1", role: auth.role },
    loading: false,
    isFbManager: auth.role === "fb_manager",
  }),
}));
vi.mock("@/lib/api/client", () => ({ callApi: vi.fn() }));

// A query builder that records every filter the page applies.
const calls = vi.hoisted(() => ({ queries: [] as string[][] }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => {
      const filters: string[] = [];
      calls.queries.push(filters);
      const q: Record<string, unknown> = {};
      const chain = () => q;
      Object.assign(q, {
        select: chain,
        order: chain,
        limit: chain,
        gte: chain,
        insert: chain,
        delete: chain,
        eq: (col: string, v: string) => {
          filters.push(`${col}=${v}`);
          return q;
        },
        in: (col: string, v: string[]) => {
          filters.push(`${col} in ${v.join(",")}`);
          return q;
        },
        then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
      });
      return q;
    },
  }),
}));

beforeEach(() => {
  calls.queries.length = 0;
});

async function renderPage() {
  const { default: Page } = await import("@/app/revenue/page");
  return render(<Page />);
}

describe("revenue for the F&B Manager", () => {
  it("only reads Buckley's revenue (restaurant and bar) and uploads only those reports", async () => {
    await renderPage();
    await waitFor(() => expect(calls.queries.length).toBeGreaterThanOrEqual(4));
    for (const filters of calls.queries) expect(filters).toContain("category in food_beverage,bar");
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Restaurant", "Bar"]);
  });

  it("reads everything for the GM, who uploads every report type", async () => {
    auth.role = "gm";
    await renderPage();
    await waitFor(() => expect(calls.queries.length).toBeGreaterThanOrEqual(4));
    for (const filters of calls.queries) expect(filters.some((f) => f.startsWith("category"))).toBe(false);
    expect(screen.getAllByRole("radio").map((r) => r.textContent)).toEqual(["Restaurant", "Bar", "Pro Shop", "Other report"]);
    expect(screen.getByText("Pick the report type first")).toBeTruthy();
    auth.role = "fb_manager";
  });
});
