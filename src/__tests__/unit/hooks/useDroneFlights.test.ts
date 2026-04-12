/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock supabase client
const mockSelect = vi.fn();
const mockOrder = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();
const mockEqBand = vi.fn();
const mockDelete = vi.fn();
const mockDeleteEq = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// Mock fetch for upload
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();

  // Default chain: from("drone_flights").select("*").order(...)
  mockOrder.mockResolvedValue({ data: [], error: null });
  mockEqBand.mockReturnValue({ order: mockOrder });
  mockLte.mockReturnValue({ order: mockOrder, eq: mockEqBand });
  mockGte.mockReturnValue({ order: mockOrder, lte: mockLte, eq: mockEqBand });
  mockSelect.mockReturnValue({
    order: mockOrder,
    gte: mockGte,
    lte: mockLte,
    eq: mockEqBand,
  });

  // Delete chain: from("drone_flights").delete().eq("id", ...)
  mockDeleteEq.mockResolvedValue({ error: null });
  mockDelete.mockReturnValue({ eq: mockDeleteEq });

  mockFrom.mockReturnValue({
    select: mockSelect,
    delete: mockDelete,
  });

  globalThis.fetch = originalFetch;
});

describe("useDroneFlights", () => {
  it("fetchFlights returns data on success", async () => {
    const mockFlights = [
      {
        id: "f1",
        flight_date: "2026-04-10",
        geotiff_path: null,
        preview_png_path: "2026-04-10/abc.png",
        bbox: null,
        band: "ndvi",
        source: "dji",
        notes: "test flight",
        uploaded_by: "user-1",
        created_at: "2026-04-10T12:00:00Z",
      },
    ];
    mockOrder.mockResolvedValueOnce({ data: mockFlights, error: null });

    const { useDroneFlights } = await import(
      "@/lib/hooks/useDroneFlights"
    );
    const { result } = renderHook(() => useDroneFlights());

    let flights: unknown[] = [];
    await act(async () => {
      flights = await result.current.fetchFlights();
    });

    expect(flights).toHaveLength(1);
    expect(flights[0]).toHaveProperty("id", "f1");
    expect(result.current.flights).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("fetchFlights returns empty on error", async () => {
    mockOrder.mockResolvedValueOnce({
      data: null,
      error: { message: "DB error" },
    });

    const { useDroneFlights } = await import(
      "@/lib/hooks/useDroneFlights"
    );
    const { result } = renderHook(() => useDroneFlights());

    let flights: unknown[] = [];
    await act(async () => {
      flights = await result.current.fetchFlights();
    });

    expect(flights).toHaveLength(0);
    expect(result.current.error).toBe("DB error");
  });

  it("uploadFlight sends FormData to API and returns row", async () => {
    const mockRow = {
      id: "f2",
      flight_date: "2026-04-11",
      geotiff_path: null,
      preview_png_path: "2026-04-11/xyz.png",
      bbox: null,
      band: "rgb",
      source: "manual",
      notes: null,
      uploaded_by: "user-1",
      created_at: "2026-04-11T12:00:00Z",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockRow,
    }) as unknown as typeof fetch;

    const { useDroneFlights } = await import(
      "@/lib/hooks/useDroneFlights"
    );
    const { result } = renderHook(() => useDroneFlights());

    const formData = new FormData();
    formData.append("file", new Blob(["fake"]), "test.png");
    formData.append("flight_date", "2026-04-11");

    let uploaded: unknown = null;
    await act(async () => {
      uploaded = await result.current.uploadFlight(formData);
    });

    expect(uploaded).toHaveProperty("id", "f2");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/drone/upload",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("deleteFlight handles success and error", async () => {
    const { useDroneFlights } = await import(
      "@/lib/hooks/useDroneFlights"
    );
    const { result } = renderHook(() => useDroneFlights());

    // Success case
    mockDeleteEq.mockResolvedValueOnce({ error: null });
    let success = false;
    await act(async () => {
      success = await result.current.deleteFlight("f1");
    });
    expect(success).toBe(true);

    // Error case
    mockDeleteEq.mockResolvedValueOnce({
      error: { message: "Permission denied" },
    });
    let failed = false;
    await act(async () => {
      failed = await result.current.deleteFlight("f2");
    });
    expect(failed).toBe(false);
    expect(result.current.error).toBe("Permission denied");
  });
});
