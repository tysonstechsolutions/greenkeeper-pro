/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// NOTE: We stub module env at the top so the hook reads it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

describe("usePushSubscription", () => {
  const originalEnv = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  beforeEach(() => {
    // Reset globals between tests
    delete g.Notification;
    delete g.PushManager;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g.navigator as any).serviceWorker = undefined;
    g.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalEnv;
  });

  it("returns isConfigured=false when NEXT_PUBLIC_VAPID_PUBLIC_KEY is undefined", async () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    vi.resetModules();
    const mod = await import("@/lib/hooks/usePushSubscription");
    const { result } = renderHook(() => mod.usePushSubscription());
    expect(result.current.isConfigured).toBe(false);
  });

  it("returns isConfigured=true + isSubscribed=false + permission=default initially when configured", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BHn9qfRQPrROE_7fPVYOsjU7FgyFsTkRfkpvHhPa1234567890abcdefGHIJKLMNOPQRSTUVWXYZ";

    g.Notification = { permission: "default", requestPermission: vi.fn() };
    g.PushManager = function PushManager() {};
    const getSubscription = vi.fn().mockResolvedValue(null);
    const swReady = Promise.resolve({
      pushManager: { getSubscription, subscribe: vi.fn() },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g.navigator as any).serviceWorker = { ready: swReady };

    vi.resetModules();
    const mod = await import("@/lib/hooks/usePushSubscription");
    const { result } = renderHook(() => mod.usePushSubscription());

    await waitFor(() => {
      expect(result.current.isConfigured).toBe(true);
    });
    expect(result.current.permission).toBe("default");
    expect(result.current.isSubscribed).toBe(false);
  });

  it("subscribe() calls pushManager.subscribe and POSTs to /api/push/subscribe", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BHn9qfRQPrROE_7fPVYOsjU7FgyFsTkRfkpvHhPa1234567890abcdefGHIJKLMNOPQRSTUVWXYZ";

    g.Notification = {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };
    g.PushManager = function PushManager() {};

    const fakeSub = {
      endpoint: "https://push.example/abc",
      toJSON: () => ({
        endpoint: "https://push.example/abc",
        keys: { p256dh: "p", auth: "a" },
      }),
    };
    const subscribeMock = vi.fn().mockResolvedValue(fakeSub);
    const getSubscription = vi.fn().mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g.navigator as any).serviceWorker = {
      ready: Promise.resolve({
        pushManager: { getSubscription, subscribe: subscribeMock },
      }),
    };

    g.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, id: "1" }) });

    vi.resetModules();
    const mod = await import("@/lib/hooks/usePushSubscription");
    const { result } = renderHook(() => mod.usePushSubscription());

    let ok = false;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    expect(ok).toBe(true);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(g.fetch).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "POST" })
    );
    await waitFor(() => {
      expect(result.current.isSubscribed).toBe(true);
    });
  });

  it("handles pushManager.subscribe throwing (permission denied)", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BHn9qfRQPrROE_7fPVYOsjU7FgyFsTkRfkpvHhPa1234567890abcdefGHIJKLMNOPQRSTUVWXYZ";

    g.Notification = {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };
    g.PushManager = function PushManager() {};

    const subscribeMock = vi
      .fn()
      .mockRejectedValue(new Error("NotAllowedError"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (g.navigator as any).serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe: subscribeMock,
        },
      }),
    };
    g.fetch = vi.fn();

    vi.resetModules();
    const mod = await import("@/lib/hooks/usePushSubscription");
    const { result } = renderHook(() => mod.usePushSubscription());

    let ok = true;
    await act(async () => {
      ok = await result.current.subscribe();
    });

    expect(ok).toBe(false);
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(g.fetch).not.toHaveBeenCalled();
  });
});
