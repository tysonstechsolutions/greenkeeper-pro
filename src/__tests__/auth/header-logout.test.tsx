import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/today",
}));
const signOut = vi.fn(async () => undefined);
vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({
    profile: { id: "u1", full_name: "Wrong Person", role: "crew", language_preference: "en" },
    loading: false,
    refreshProfile: vi.fn(),
    signOut,
  }),
}));
vi.mock("@/lib/hooks/useWeather", () => ({
  useWeather: () => ({ currentWeather: null, getAlerts: () => [], error: null }),
}));
vi.mock("@/lib/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    refresh: vi.fn(),
    fetchNotifications: vi.fn(),
  }),
  formatTimeAgo: () => "",
}));
vi.mock("@/lib/hooks/useScrollDirection", () => ({ useScrollDirection: () => "up" }));
const queue = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/auth/sign-out", () => ({
  SIGNED_OUT_PATH: "/pin-login/",
  unsyncedChangeCount: async () => queue.count,
}));

import { Header } from "@/components/layout/header";

const replace = vi.fn();
beforeEach(() => {
  signOut.mockClear();
  replace.mockClear();
  queue.count = 0;
  Object.defineProperty(window, "location", { value: { ...window.location, replace }, writable: true, configurable: true });
});

async function openMenu() {
  render(<Header />);
  fireEvent.click(screen.getAllByText("Wrong Person")[0].closest("button")!);
  return screen.findByRole("button", { name: "Log out" });
}

describe("Log out", () => {
  it("is in the user menu, confirms, signs out, and goes to the PIN screen", async () => {
    const confirm = vi.fn<(message?: string) => boolean>(() => true);
    window.confirm = confirm;
    fireEvent.click(await openMenu());
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/pin-login/"));
    expect(confirm).toHaveBeenCalledWith("Log out as Wrong Person?");
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("does nothing when cancelled, and warns about unsynced offline changes", async () => {
    queue.count = 2;
    const confirm = vi.fn<(message?: string) => boolean>(() => false);
    window.confirm = confirm;
    fireEvent.click(await openMenu());
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0][0]).toContain("2 changes made offline haven't synced yet");
    expect(signOut).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
