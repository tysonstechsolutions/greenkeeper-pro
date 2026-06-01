/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

beforeEach(() => {
  document.body.style.overflow = "";
});

describe("useBodyScrollLock", () => {
  it("sets body overflow to hidden while active", () => {
    renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("restores the previous overflow value on unmount", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("does nothing when inactive", () => {
    document.body.style.overflow = "auto";
    renderHook(() => useBodyScrollLock(false));
    expect(document.body.style.overflow).toBe("auto");
  });

  it("defaults to active when called with no argument", () => {
    renderHook(() => useBodyScrollLock());
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("locks and unlocks as the active flag toggles", () => {
    document.body.style.overflow = "visible";
    const { rerender, unmount } = renderHook(
      ({ active }: { active: boolean }) => useBodyScrollLock(active),
      { initialProps: { active: false } },
    );
    // Inactive → untouched
    expect(document.body.style.overflow).toBe("visible");

    // Activate → locked
    rerender({ active: true });
    expect(document.body.style.overflow).toBe("hidden");

    // Deactivate → restored to what it saw when it locked
    rerender({ active: false });
    expect(document.body.style.overflow).toBe("visible");

    unmount();
    expect(document.body.style.overflow).toBe("visible");
  });

  it("nested locks each restore the value they captured", () => {
    document.body.style.overflow = "auto";

    const outer = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");

    // Second lock captures "hidden" as its previous value.
    const inner = renderHook(() => useBodyScrollLock(true));
    expect(document.body.style.overflow).toBe("hidden");

    inner.unmount();
    expect(document.body.style.overflow).toBe("hidden");

    outer.unmount();
    expect(document.body.style.overflow).toBe("auto");
  });
});
