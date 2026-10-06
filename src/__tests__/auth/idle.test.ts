import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDLE_MINUTES,
  LAST_ACTIVITY_KEY,
  idleChoiceLabel,
  idleState,
  readIdleMinutes,
  secondsLeft,
  writeIdleMinutes,
} from "@/lib/auth/idle";
import { clearSignedInAccount } from "@/lib/auth/sign-out";

function memoryStore(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
    m,
  };
}

const MIN = 60_000;

describe("idle log-out", () => {
  it("is active, then warns for the last minute, then expires", () => {
    expect(idleState(0, 28 * MIN, 30)).toBe("active");
    expect(idleState(0, 29 * MIN, 30)).toBe("warning");
    expect(secondsLeft(0, 29 * MIN + 15_000, 30)).toBe(45);
    expect(idleState(0, 30 * MIN, 30)).toBe("expired");
  });

  it("never logs out when turned off", () => {
    expect(idleState(0, 10_000 * MIN, 0)).toBe("active");
  });

  it("remembers this device's choice, defaulting to 30 minutes", () => {
    const store = memoryStore();
    expect(readIdleMinutes(store)).toBe(DEFAULT_IDLE_MINUTES);
    writeIdleMinutes(0, store);
    expect(readIdleMinutes(store)).toBe(0);
    writeIdleMinutes(60, store);
    expect(readIdleMinutes(store)).toBe(60);
    store.setItem("gk.idleLogoutMinutes", "7");
    expect(readIdleMinutes(store)).toBe(DEFAULT_IDLE_MINUTES);
  });

  it("labels the choices", () => {
    expect([0, 15, 60, 120].map(idleChoiceLabel)).toEqual(["Never", "After 15 minutes", "After 1 hour", "After 2 hours"]);
  });

  it("logging out clears the activity clock so the next person starts fresh", async () => {
    const store = memoryStore({ [LAST_ACTIVITY_KEY]: "123", "sb-abc-auth-token": "x", other: "keep" });
    await clearSignedInAccount(async () => undefined, store);
    expect([...store.m.keys()]).toEqual(["other"]);
  });
});
