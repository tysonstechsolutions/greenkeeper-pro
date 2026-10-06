import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/pro-shop-schedule",
  useSearchParams: () => new URLSearchParams(""),
}));
const auth = vi.hoisted(() => ({ role: "fb_manager" }));
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: { id: "u1", full_name: "Brittany Flament", role: auth.role },
    loading: false,
    isFbManager: auth.role === "fb_manager",
  }),
}));
vi.mock("@/lib/api/client", () => ({ callApi: vi.fn() }));
vi.mock("@/lib/supabase/rest", () => ({
  directSelectList: vi.fn(async () => []),
  directSelectAll: vi.fn(async () => []),
  directSelectRow: vi.fn(async () => null),
  directRpc: vi.fn(async () => null),
  directInsertRow: vi.fn(async () => null),
  directPatchRow: vi.fn(async () => undefined),
  directDeleteRow: vi.fn(async () => undefined),
  getCachedUserId: () => "u1",
}));

beforeEach(() => {
  auth.role = "fb_manager";
});

async function renderPage() {
  const { default: Page } = await import("@/app/pro-shop-schedule/page");
  return render(<Page />);
}

describe("schedule for the F&B Manager", () => {
  it("opens on Buckley's and offers no other area", async () => {
    await renderPage();
    expect(await screen.findByRole("heading", { name: /Buckley's Restaurant Schedule/ })).toBeTruthy();
    const group = screen.getByRole("group", { name: "Choose schedule" });
    const tabs = Array.from(group.querySelectorAll("button")).map((b) => b.textContent);
    expect(tabs).toEqual(["Buckley's Restaurant"]);
  });

  it("still shows every area to the GM", async () => {
    auth.role = "gm";
    await renderPage();
    await waitFor(() => expect(screen.getByRole("group", { name: "Choose schedule" })).toBeTruthy());
    const tabs = Array.from(screen.getByRole("group", { name: "Choose schedule" }).querySelectorAll("button")).map(
      (b) => b.textContent,
    );
    expect(tabs).toEqual(["Pro Shop", "Maintenance Crew", "Buckley's Restaurant"]);
  });

  it("is closed to crew", async () => {
    auth.role = "crew";
    await renderPage();
    expect(await screen.findByText(/restricted to authorized management/)).toBeTruthy();
  });
});
