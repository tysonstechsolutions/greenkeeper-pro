import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { LAST_ACTIVITY_KEY } from "@/lib/auth/idle";

const auth = vi.hoisted(() => ({ signOut: vi.fn(async () => undefined), user: { id: "u1" } as { id: string } | null }));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => auth }));
const queue = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/lib/auth/sign-out", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/sign-out")>("@/lib/auth/sign-out");
  return { ...actual, unsyncedChangeCount: async () => queue.count };
});

import { IdleLogout } from "@/components/auth/idle-logout";

const NOW = new Date(2026, 9, 6, 12, 0, 0).getTime();
const replace = vi.fn();
const realLocation = window.location;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  localStorage.clear();
  auth.signOut.mockClear();
  replace.mockClear();
  queue.count = 0;
  Object.defineProperty(window, "location", { configurable: true, value: { ...realLocation, replace } });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, "location", { configurable: true, value: realLocation });
});

const flush = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
};

describe("IdleLogout", () => {
  it("starts the clock on a fresh sign-in", async () => {
    render(<IdleLogout />);
    await flush();
    expect(Number(localStorage.getItem(LAST_ACTIVITY_KEY))).toBe(NOW);
    expect(screen.queryByText("Still there?")).toBeNull();
  });

  it("warns in the last minute, and 'I'm still here' keeps the session", async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - 29.5 * 60_000));
    render(<IdleLogout />);
    await flush();
    expect(screen.getByText("Still there?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "I'm still here" }));
    expect(screen.queryByText("Still there?")).toBeNull();
    await flush();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("logs out when the time is up, even after the app was closed", async () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - 3 * 60 * 60_000));
    render(<IdleLogout />);
    await flush();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/pin-login/?reason=idle");
  });

  it("never logs out with offline changes still waiting to sync", async () => {
    queue.count = 2;
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - 3 * 60 * 60_000));
    render(<IdleLogout />);
    await flush();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("does nothing when this device has it turned off", async () => {
    localStorage.setItem("gk.idleLogoutMinutes", "0");
    localStorage.setItem(LAST_ACTIVITY_KEY, String(NOW - 3 * 60 * 60_000));
    render(<IdleLogout />);
    await flush();
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(screen.queryByText("Still there?")).toBeNull();
  });
});
