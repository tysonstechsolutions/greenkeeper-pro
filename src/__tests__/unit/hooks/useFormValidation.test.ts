/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFormValidation } from "@/lib/hooks/useFormValidation";

type Fields = {
  title: string;
  category: string;
};

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useFormValidation", () => {
  it("returns true and sets no errors when all validators pass", () => {
    const { result } = renderHook(() => useFormValidation<Fields>());

    let ok = false;
    act(() => {
      ok = result.current.validate({ title: null, category: null });
    });

    expect(ok).toBe(true);
    expect(result.current.errors).toEqual({});
  });

  it("returns false and records errors for failing validators", () => {
    const { result } = renderHook(() => useFormValidation<Fields>());

    let ok = true;
    act(() => {
      ok = result.current.validate({
        title: "Title is required",
        category: null,
      });
    });

    expect(ok).toBe(false);
    expect(result.current.errors.title).toBe("Title is required");
    expect(result.current.errors.category).toBeUndefined();
  });

  it("treats empty-string messages as valid (not an error)", () => {
    const { result } = renderHook(() => useFormValidation<Fields>());

    let ok = false;
    act(() => {
      ok = result.current.validate({ title: "", category: null });
    });

    expect(ok).toBe(true);
    expect(result.current.errors).toEqual({});
  });

  it("clearError removes a single error and leaves others", () => {
    const { result } = renderHook(() => useFormValidation<Fields>());

    act(() => {
      result.current.validate({
        title: "Title is required",
        category: "Category is required",
      });
    });
    expect(result.current.errors.title).toBe("Title is required");
    expect(result.current.errors.category).toBe("Category is required");

    act(() => {
      result.current.clearError("title");
    });
    expect(result.current.errors.title).toBeUndefined();
    expect(result.current.errors.category).toBe("Category is required");
  });

  it("focuses the first invalid field by id", async () => {
    // Provide a real input the hook can find + focus.
    const input = document.createElement("input");
    input.id = "title";
    document.body.appendChild(input);

    // happy-dom implements rAF; fall back to a microtask shim if absent.
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    const { result } = renderHook(() => useFormValidation<Fields>());

    act(() => {
      result.current.validate({
        title: "Title is required",
        category: null,
      });
    });

    expect(document.activeElement).toBe(input);
    raf.mockRestore();
  });

  it("does not throw when the first invalid field has no matching element", () => {
    const raf = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    const { result } = renderHook(() => useFormValidation<Fields>());

    expect(() => {
      act(() => {
        result.current.validate({ title: "Title is required", category: null });
      });
    }).not.toThrow();

    raf.mockRestore();
  });
});
