import { describe, it, expect } from "vitest";
import {
  calculateDollarSpotProbability,
  getDollarSpotRisk,
} from "@/lib/utils/disease-models";
import {
  findBestSprayWindows,
  scoreHour,
  type HourlyForecast,
} from "@/lib/utils/spray-window";

// ─── Smith-Kerns dollar spot model ───────────────────────────────────────────

describe("calculateDollarSpotProbability", () => {
  it("returns near-zero for cold/dry conditions (50F, 40% RH)", () => {
    const p = calculateDollarSpotProbability({ avgTemp5dF: 50, avgRh5d: 40 });
    expect(p).toBeLessThan(0.05);
    expect(p).toBeGreaterThanOrEqual(0);
  });

  it("returns >0.5 for warm/humid conditions (80F, 90% RH)", () => {
    const p = calculateDollarSpotProbability({ avgTemp5dF: 80, avgRh5d: 90 });
    expect(p).toBeGreaterThan(0.5);
  });

  it("returns value between 0 and 1", () => {
    const p = calculateDollarSpotProbability({ avgTemp5dF: 70, avgRh5d: 60 });
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("increases with temperature", () => {
    const pLow = calculateDollarSpotProbability({ avgTemp5dF: 60, avgRh5d: 70 });
    const pHigh = calculateDollarSpotProbability({ avgTemp5dF: 80, avgRh5d: 70 });
    expect(pHigh).toBeGreaterThan(pLow);
  });

  it("increases with humidity", () => {
    const pLow = calculateDollarSpotProbability({ avgTemp5dF: 75, avgRh5d: 40 });
    const pHigh = calculateDollarSpotProbability({ avgTemp5dF: 75, avgRh5d: 90 });
    expect(pHigh).toBeGreaterThan(pLow);
  });
});

describe("getDollarSpotRisk", () => {
  it("returns 'low' for p=0.1", () => {
    expect(getDollarSpotRisk(0.1)).toBe("low");
  });

  it("returns 'moderate' for p=0.3", () => {
    expect(getDollarSpotRisk(0.3)).toBe("moderate");
  });

  it("returns 'high' for p=0.5", () => {
    expect(getDollarSpotRisk(0.5)).toBe("high");
  });

  it("returns 'very-high' for p=0.7", () => {
    expect(getDollarSpotRisk(0.7)).toBe("very-high");
  });

  it("returns 'low' for p=0", () => {
    expect(getDollarSpotRisk(0)).toBe("low");
  });

  it("returns 'very-high' for p=1", () => {
    expect(getDollarSpotRisk(1)).toBe("very-high");
  });
});

// ─── Spray window scoring ────────────────────────────────────────────────────

function makeHour(
  hour: number,
  overrides: Partial<HourlyForecast> = {}
): HourlyForecast {
  return {
    datetime: `2026-04-11T${String(hour).padStart(2, "0")}:00:00`,
    temp_f: 72,
    humidity: 60,
    wind_mph: 5,
    precip_chance: 5,
    ...overrides,
  };
}

describe("scoreHour", () => {
  it("scores ideal morning conditions highly", () => {
    const s = scoreHour(makeHour(6, { wind_mph: 3, precip_chance: 0 }));
    // wind=1, rain=1, time=1 => 1.0
    expect(s).toBe(1);
  });

  it("gives low score for midday with high wind and rain", () => {
    const s = scoreHour(makeHour(13, { wind_mph: 20, precip_chance: 80 }));
    // wind=0, rain=0, time=0.2 => 0
    expect(s).toBe(0);
  });
});

describe("findBestSprayWindows", () => {
  it("returns empty array for empty forecast", () => {
    const result = findBestSprayWindows([], 0.5);
    expect(result).toEqual([]);
  });

  it("returns windows sorted by score descending", () => {
    // Create 12 hours: 4am-3pm
    // Hours 5-8 should be the best window (ideal morning, low wind)
    const forecast: HourlyForecast[] = [];
    for (let h = 4; h < 16; h++) {
      forecast.push(
        makeHour(h, {
          wind_mph: h >= 5 && h <= 8 ? 3 : 14,
          precip_chance: h >= 5 && h <= 8 ? 0 : 40,
        })
      );
    }

    const windows = findBestSprayWindows(forecast, 0.6);
    expect(windows.length).toBe(3);
    // The best window should start around 5am
    expect(windows[0].score).toBeGreaterThan(windows[1].score);
    expect(windows[0].start).toContain("T05:");
  });

  it("returns low scores when all hours have 100% rain", () => {
    const forecast: HourlyForecast[] = [];
    for (let h = 0; h < 12; h++) {
      forecast.push(makeHour(h, { precip_chance: 100 }));
    }

    const windows = findBestSprayWindows(forecast, 0.5);
    // All should have score 0 because rain_score = 0 for precip >= 50
    for (const w of windows) {
      expect(w.score).toBe(0);
    }
  });

  it("uses disease pressure as a multiplier", () => {
    const forecast: HourlyForecast[] = [];
    for (let h = 5; h < 10; h++) {
      forecast.push(makeHour(h, { wind_mph: 3, precip_chance: 0 }));
    }

    const lowPressure = findBestSprayWindows(forecast, 0.2);
    const highPressure = findBestSprayWindows(forecast, 0.8);

    expect(highPressure[0].score).toBeGreaterThan(lowPressure[0].score);
  });

  it("returns at most 3 windows", () => {
    const forecast: HourlyForecast[] = [];
    for (let h = 0; h < 24; h++) {
      forecast.push(makeHour(h));
    }

    const windows = findBestSprayWindows(forecast, 0.5);
    expect(windows.length).toBeLessThanOrEqual(3);
  });

  it("handles forecast shorter than window size", () => {
    const forecast = [makeHour(6), makeHour(7)];
    // windowSize defaults to 4, but only 2 hours available
    // Should still produce at least one window (degenerate case)
    const windows = findBestSprayWindows(forecast, 0.5);
    // With 2 items and windowSize 4, limit = max(1, 2-4+1) = max(1,-1) = 1
    expect(windows.length).toBe(1);
  });
});
