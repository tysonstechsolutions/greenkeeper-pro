/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock the supabase client module
const mockUpsert = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

beforeEach(() => {
  vi.clearAllMocks();

  // Default: select chain → returns an empty array
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockEq.mockReturnValue({ order: mockOrder });
  mockSelect.mockReturnValue({ eq: mockEq });

  // Default: upsert chain → .upsert(...).select().single() returns a row
  mockSingle.mockResolvedValue({
    data: {
      id: "pin-1",
      date: "2026-04-11",
      hole_number: 5,
      paces_from_front: 10,
      paces_from_left: 8,
      difficulty: null,
      notes: null,
      set_by: null,
      created_at: "2026-04-11T00:00:00Z",
      updated_at: "2026-04-11T00:00:00Z",
    },
    error: null,
  });
  // For bulk upsert without .select().single()
  mockUpsert.mockImplementation(() => ({
    select: () => ({ single: mockSingle }),
    // If caller doesn't chain select(), upsert itself resolves:
    then: (onFulfilled: (v: { data: null; error: null }) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled),
  }));

  mockFrom.mockReturnValue({
    select: mockSelect,
    upsert: mockUpsert,
  });
});

describe("usePinPositions", () => {
  it("fetchPinsByDate returns rows from supabase", async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: "a",
          date: "2026-04-11",
          hole_number: 1,
          paces_from_front: 12,
          paces_from_left: 8,
          difficulty: "medium",
          notes: null,
          set_by: null,
          created_at: "",
          updated_at: "",
        },
      ],
      error: null,
    });

    const { usePinPositions } = await import("@/lib/hooks/usePinPositions");
    const { result } = renderHook(() => usePinPositions());

    let rows;
    await act(async () => {
      rows = await result.current.fetchPinsByDate("2026-04-11");
    });

    expect(rows).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith("pin_positions");
    expect(mockEq).toHaveBeenCalledWith("date", "2026-04-11");
  });

  it("fetchPinsByDate returns empty array on error", async () => {
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: { message: "db down" },
    });

    const { usePinPositions } = await import("@/lib/hooks/usePinPositions");
    const { result } = renderHook(() => usePinPositions());

    let rows: unknown;
    await act(async () => {
      rows = await result.current.fetchPinsByDate("2026-04-11");
    });

    expect(rows).toEqual([]);
  });

  it("upsertPin rejects invalid hole_number and does not hit supabase", async () => {
    const { usePinPositions } = await import("@/lib/hooks/usePinPositions");
    const { result } = renderHook(() => usePinPositions());

    let out;
    await act(async () => {
      out = await result.current.upsertPin({
        date: "2026-04-11",
        hole_number: 19, // invalid
        paces_from_front: 10,
        paces_from_left: 10,
      });
    });

    expect(out).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/hole_number/);
  });

  it("upsertPin rejects out-of-range paces", async () => {
    const { usePinPositions } = await import("@/lib/hooks/usePinPositions");
    const { result } = renderHook(() => usePinPositions());

    let out;
    await act(async () => {
      out = await result.current.upsertPin({
        date: "2026-04-11",
        hole_number: 3,
        paces_from_front: 99, // too high (>50)
        paces_from_left: 5,
      });
    });

    expect(out).toBeNull();
    expect(mockUpsert).not.toHaveBeenCalled();

    // And paces_from_left out of range
    let out2;
    await act(async () => {
      out2 = await result.current.upsertPin({
        date: "2026-04-11",
        hole_number: 3,
        paces_from_front: 5,
        paces_from_left: 99,
      });
    });
    expect(out2).toBeNull();
  });

  it("setBulkPins validates and calls a single upsert on supabase", async () => {
    const bulkUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom.mockReturnValueOnce({
      upsert: bulkUpsert,
      select: mockSelect,
    });

    const { usePinPositions } = await import("@/lib/hooks/usePinPositions");
    const { result } = renderHook(() => usePinPositions());

    const validPins = Array.from({ length: 18 }, (_, i) => ({
      date: "2026-04-11",
      hole_number: i + 1,
      paces_from_front: 10,
      paces_from_left: 10,
    }));

    let ok;
    await act(async () => {
      ok = await result.current.setBulkPins(validPins);
    });

    expect(ok).toBe(true);
    expect(bulkUpsert).toHaveBeenCalledTimes(1);
    const payloadArg = bulkUpsert.mock.calls[0][0];
    expect(Array.isArray(payloadArg)).toBe(true);
    expect(payloadArg).toHaveLength(18);
  });
});
