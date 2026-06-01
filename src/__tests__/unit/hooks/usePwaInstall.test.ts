/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePwaInstall } from "@/lib/hooks/usePwaInstall";

/**
 * Builds a fake BeforeInstallPromptEvent. The real event is non-constructible
 * in jsdom/happy-dom, so we fake the shape the hook relies on.
 */
function makeBipEvent(outcome: "accepted" | "dismissed") {
  const e = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string; platform: string }>;
    platforms: string[];
  };
  e.preventDefault = vi.fn();
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome, platform: "web" });
  e.platforms = ["web"];
  return e;
}

beforeEach(() => {
  // The hook stores capture state in module scope; tests that rely on a fresh
  // module must reset it. Vitest isolates modules per test file, not per test,
  // so within this file we account for the shared listener being attached on
  // the first subscribe.
  vi.restoreAllMocks();
});

describe("usePwaInstall", () => {
  it("starts with canInstall=false until the event fires", () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canInstall).toBe(false);
  });

  it("flips canInstall=true after beforeinstallprompt fires", async () => {
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      window.dispatchEvent(makeBipEvent("accepted"));
    });

    expect(result.current.canInstall).toBe(true);
  });

  it("promptInstall returns the outcome and consumes the event", async () => {
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      window.dispatchEvent(makeBipEvent("accepted"));
    });
    expect(result.current.canInstall).toBe(true);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe("accepted");
    // Event is single-use: canInstall returns to false afterward.
    expect(result.current.canInstall).toBe(false);
  });

  it("promptInstall returns 'unavailable' when no event was captured", async () => {
    const { result } = renderHook(() => usePwaInstall());

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe("unavailable");
  });

  it("marks isInstalled after the appinstalled event", async () => {
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      window.dispatchEvent(new Event("appinstalled"));
    });

    expect(result.current.isInstalled).toBe(true);
  });
});
