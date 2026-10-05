// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const offline = vi.hoisted(() => ({ clearCache: vi.fn(), clearQueue: vi.fn(), getQueueCount: vi.fn() }));
vi.mock("@/lib/offline/cache", () => ({ clearCache: offline.clearCache }));
vi.mock("@/lib/utils/offline-queue", () => ({ clearQueue: offline.clearQueue, getQueueCount: offline.getQueueCount }));

import { clearSignedInAccount, isSupabaseSessionKey, unsyncedChangeCount } from "@/lib/auth/sign-out";

function memoryStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get length() {
      return data.size;
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
  };
}

beforeEach(() => {
  offline.clearCache.mockReset().mockResolvedValue(undefined);
  offline.clearQueue.mockReset().mockResolvedValue(undefined);
  offline.getQueueCount.mockReset().mockResolvedValue(0);
});

describe("sign out", () => {
  it("recognizes saved Supabase sessions only", () => {
    expect(isSupabaseSessionKey("sb-mbgublyqnyghmvqfooao-auth-token")).toBe(true);
    expect(isSupabaseSessionKey("sb-abc-auth-token-code-verifier")).toBe(true);
    expect(isSupabaseSessionKey("gk_unlocked")).toBe(false);
    expect(isSupabaseSessionKey("theme")).toBe(false);
  });

  it("signs out, deletes the saved session, and clears cached data, keeping device settings", async () => {
    const storage = memoryStorage({
      "sb-mbgublyqnyghmvqfooao-auth-token": "{}",
      gk_unlocked: "1",
      theme: "dark",
    });
    const signOut = vi.fn().mockResolvedValue({ error: null });
    await clearSignedInAccount(signOut, storage);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect([...storage.data.keys()].sort()).toEqual(["gk_unlocked", "theme"]);
    expect(offline.clearCache).toHaveBeenCalled();
    expect(offline.clearQueue).toHaveBeenCalled();
  });

  it("still logs out when Supabase's sign-out hangs or fails", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage({ "sb-x-auth-token": "{}" });
    const done = clearSignedInAccount(() => new Promise(() => {}), storage);
    await vi.advanceTimersByTimeAsync(3_100);
    await done;
    expect(storage.data.size).toBe(0);
    vi.useRealTimers();

    const storage2 = memoryStorage({ "sb-x-auth-token": "{}" });
    offline.clearCache.mockRejectedValue(new Error("no idb"));
    await clearSignedInAccount(() => Promise.reject(new Error("offline")), storage2);
    expect(storage2.data.size).toBe(0);
  });

  it("counts unsynced offline changes, treating errors as none", async () => {
    offline.getQueueCount.mockResolvedValueOnce(3);
    expect(await unsyncedChangeCount()).toBe(3);
    offline.getQueueCount.mockRejectedValueOnce(new Error("no idb"));
    expect(await unsyncedChangeCount()).toBe(0);
  });
});
