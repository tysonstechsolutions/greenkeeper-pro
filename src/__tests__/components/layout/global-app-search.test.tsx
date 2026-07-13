import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GlobalAppSearch } from "@/components/layout/global-app-search";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  record: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    isPro: false,
    isForeman: false,
    isMechanic: false,
    isCrew: false,
    profile: { role: "super" },
  }),
}));

vi.mock("@/lib/hooks/useAppUsage", () => ({
  useAppUsage: () => ({ record: mocks.record }),
}));

describe("GlobalAppSearch", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.record.mockReset();
  });

  it("searches nested tools and navigates to the selected page", async () => {
    const user = userEvent.setup();
    render(<GlobalAppSearch />);

    await user.click(screen.getAllByRole("button", { name: "Search the whole app" })[0]);
    await user.type(
      screen.getByPlaceholderText("Search pages, tools, and forms…"),
      "equipment",
    );
    await user.click(screen.getByText("Equipment"));

    expect(mocks.record).toHaveBeenCalledWith("/equipment");
    expect(mocks.push).toHaveBeenCalledWith("/equipment");
  });

  it("opens from the global keyboard shortcut and finds 1x1 paperwork", async () => {
    const user = userEvent.setup();
    render(<GlobalAppSearch />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByPlaceholderText("Search pages, tools, and forms…");
    await user.type(input, "1x1");

    expect(screen.getByText("Onboarding & SOPs")).toBeInTheDocument();
  });
});
