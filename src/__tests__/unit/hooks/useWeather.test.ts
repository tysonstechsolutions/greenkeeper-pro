import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const callApi = vi.fn();
vi.mock("@/lib/api/client", () => ({ callApi: (...args: unknown[]) => callApi(...args) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));

import { useWeather } from "@/lib/hooks/useWeather";

describe("useWeather current conditions", () => {
  beforeEach(() => {
    callApi.mockReset();
  });

  it("reports 'unavailable' instead of crashing when the service sends no current block", async () => {
    callApi.mockResolvedValue({});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useWeather());
    await waitFor(() => expect(result.current.error).toBe("Weather is unavailable right now."));
    expect(result.current.currentWeather).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("still reads a normal response", async () => {
    callApi.mockResolvedValue({
      current: {
        temp_f: 61.6, feelslike_f: 60.2, humidity: 70, wind_mph: 8.4, wind_dir: "NW",
        condition: { text: "Partly cloudy", icon: "//cdn.weatherapi.com/x.png" },
        uv: 3, pressure_in: 30.1, vis_miles: 9, cloud: 40, is_day: 1, last_updated: "2026-10-08 09:30",
      },
      forecast: { forecastday: [{ day: { daily_chance_of_rain: 20 } }] },
    });
    const { result } = renderHook(() => useWeather());
    await waitFor(() => expect(result.current.currentWeather).not.toBeNull());
    expect(result.current.currentWeather).toMatchObject({ temp_f: 62, conditions: "Partly cloudy", precipitation_chance: 20, is_day: true });
  });
});
