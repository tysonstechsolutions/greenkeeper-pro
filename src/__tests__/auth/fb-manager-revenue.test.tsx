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
  it("only reads Food & Beverage revenue and hides the course-wide report upload", async () => {
    await renderPage();
    await waitFor(() => expect(calls.queries.length).toBeGreaterThanOrEqual(4));
    for (const filters of calls.queries) expect(filters).toContain("category=food_beverage");
    expect(screen.queryByText("Choose photo or PDF")).toBeNull();
  });

  it("reads everything for the GM", async () => {
    auth.role = "gm";
    await renderPage();
    await waitFor(() => expect(calls.queries.length).toBeGreaterThanOrEqual(4));
    for (const filters of calls.queries) expect(filters).not.toContain("category=food_beverage");
    expect(screen.getByText("Choose photo or PDF")).toBeTruthy();
    auth.role = "fb_manager";
  });
});
