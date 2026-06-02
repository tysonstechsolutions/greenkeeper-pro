import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../utils/test-utils";
import type { WateringPlan } from "@/lib/hooks/useWateringPlan";

// next/navigation isn't available in the test env — the page's back button
// uses useRouter. Provide a no-op router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/irrigation/schedule",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock the data hook so the page renders against a known plan (no network).
const savePlan = vi.fn().mockResolvedValue(true);
let mockReturn: {
  plan: WateringPlan | null;
  loading: boolean;
  error: string | null;
  savePlan: typeof savePlan;
  refresh: () => Promise<void>;
};

vi.mock("@/lib/hooks/useWateringPlan", async () => {
  const actual = await vi.importActual<typeof import("@/lib/hooks/useWateringPlan")>(
    "@/lib/hooks/useWateringPlan",
  );
  return { ...actual, useWateringPlan: () => mockReturn };
});

// Stable date so "today" and "running now" are deterministic. Monday 2026-06-01,
// 02:00 (inside the overnight window that starts 21:00).
const FIXED = new Date(2026, 5, 1, 2, 0, 0); // month is 0-indexed -> June
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED);
  savePlan.mockClear();
});

const samplePlan: WateringPlan = {
  id: "p1",
  name: "Summer schedule",
  active: true,
  config: {
    holeCount: 18,
    concurrencyCap: 5,
    startMinute: 21 * 60,
    finishByMinute: 6 * 60,
    greens: { depthIn: 0.15, rateInHr: 1.0, days: [0, 1, 2, 3, 4, 5, 6] },
    tees: { depthIn: 0.2, rateInHr: 0.7, days: [0, 2, 4, 6] },
    fairways: { depthIn: 0.4, rateInHr: 0.6, days: [1, 3, 5] },
    overrides: {},
  },
};

async function renderPage() {
  const { default: Page } = await import("@/app/irrigation/schedule/page");
  return render(<Page />);
}

describe("WateringSchedulePage", () => {
  it("shows a loading spinner while the plan loads", async () => {
    mockReturn = { plan: null, loading: true, error: null, savePlan, refresh: vi.fn() };
    const { container } = await renderPage();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders the three surfaces with their derived run minutes", async () => {
    mockReturn = { plan: samplePlan, loading: false, error: null, savePlan, refresh: vi.fn() };
    await renderPage();
    // "Greens" appears in both the setup row and the timeline legend.
    expect(screen.getAllByText("Greens").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tees").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fairways").length).toBeGreaterThan(0);
    // Derived run minutes: 0.15 / 1.0 * 60 = 9 ; 0.40 / 0.6 * 60 = 40
    expect(screen.getByText("9 min / cycle")).toBeInTheDocument();
    expect(screen.getByText("17 min / cycle")).toBeInTheDocument(); // 0.20/0.7*60
    expect(screen.getByText("40 min / cycle")).toBeInTheDocument();
  });

  it("renders a staggered timeline for the night", async () => {
    mockReturn = { plan: samplePlan, loading: false, error: null, savePlan, refresh: vi.fn() };
    await renderPage();
    // Monday: greens (everyday) + fairways ([1,3,5]) run -> 36 runs.
    expect(screen.getByText(/36 runs/)).toBeInTheDocument();
    // The timeline shows hole blocks.
    expect(screen.getAllByText(/^H\d+$/).length).toBeGreaterThan(0);
  });

  it("shows the schedule-finished time", async () => {
    mockReturn = { plan: samplePlan, loading: false, error: null, savePlan, refresh: vi.fn() };
    await renderPage();
    // 36 runs (18 greens @9 + 18 fairways @40) over 5 lanes; just assert a
    // "done" time renders without asserting the exact clock.
    expect(screen.getByText(/done/i)).toBeInTheDocument();
  });

  it("surfaces an error state", async () => {
    mockReturn = {
      plan: null,
      loading: false,
      error: "Failed to load the watering plan.",
      savePlan,
      refresh: vi.fn(),
    };
    await renderPage();
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });
});
