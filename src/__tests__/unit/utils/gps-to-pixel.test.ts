import { describe, expect, it } from "vitest";
import {
  gpsToImageCoords,
  imageUnitsPerMeter,
  buildCirclePolygon,
  isCalibrationUsable,
  clampPixel,
} from "@/lib/utils/gps-to-pixel";

// Approximate degrees of latitude per meter at 42° N (used by VMGC).
// 1° lat ≈ 111,000 m anywhere; 1° lng ≈ 111,000 * cos(lat).
const LAT_PER_METER = 1 / 111_000;
const LNG_PER_METER_AT_42 = 1 / (111_000 * Math.cos((42 * Math.PI) / 180));

const NORTH_UP_CAL = {
  // Tee at bottom-center of image, world (42.0, -87.0)
  p1_lat: 42.0,
  p1_lng: -87.0,
  p1_x: 0.5,
  p1_y: 0.9,
  // Green at top-center, 300 m due north
  p2_lat: 42.0 + 300 * LAT_PER_METER,
  p2_lng: -87.0,
  p2_x: 0.5,
  p2_y: 0.1,
};

describe("gpsToImageCoords", () => {
  it("maps p1 world coords back to p1 image coords (identity)", () => {
    const r = gpsToImageCoords(NORTH_UP_CAL, {
      lat: NORTH_UP_CAL.p1_lat,
      lng: NORTH_UP_CAL.p1_lng,
    });
    expect(r.x).toBeCloseTo(0.5, 6);
    expect(r.y).toBeCloseTo(0.9, 6);
  });

  it("maps p2 world coords back to p2 image coords (identity)", () => {
    const r = gpsToImageCoords(NORTH_UP_CAL, {
      lat: NORTH_UP_CAL.p2_lat,
      lng: NORTH_UP_CAL.p2_lng,
    });
    expect(r.x).toBeCloseTo(0.5, 6);
    expect(r.y).toBeCloseTo(0.1, 6);
  });

  it("maps midpoint correctly", () => {
    const r = gpsToImageCoords(NORTH_UP_CAL, {
      lat: (NORTH_UP_CAL.p1_lat + NORTH_UP_CAL.p2_lat) / 2,
      lng: -87.0,
    });
    expect(r.x).toBeCloseTo(0.5, 6);
    expect(r.y).toBeCloseTo(0.5, 6);
  });

  // ── Regression: for a north-up east-right image, east in world MUST map to
  // image-RIGHT, not image-left. This catches the y-axis sign bug that
  // existed in an earlier version of the math.
  it("REGRESSION: east in world maps to image-right on a north-up image", () => {
    const r = gpsToImageCoords(NORTH_UP_CAL, {
      lat: 42.0,
      lng: -87.0 + 10 * LNG_PER_METER_AT_42, // 10 m east
    });
    expect(r.x).toBeGreaterThan(0.5);
    expect(r.y).toBeCloseTo(0.9, 2); // unchanged at tee height
  });

  it("REGRESSION: west in world maps to image-left on a north-up image", () => {
    const r = gpsToImageCoords(NORTH_UP_CAL, {
      lat: 42.0,
      lng: -87.0 - 10 * LNG_PER_METER_AT_42, // 10 m west
    });
    expect(r.x).toBeLessThan(0.5);
    expect(r.y).toBeCloseTo(0.9, 2);
  });

  it("REGRESSION: north in world maps to image-UP (lower y) on a north-up image", () => {
    const r = gpsToImageCoords(NORTH_UP_CAL, {
      lat: 42.0 + 100 * LAT_PER_METER, // 100 m north of tee
      lng: -87.0,
    });
    expect(r.y).toBeLessThan(0.9);
    expect(r.x).toBeCloseTo(0.5, 6);
  });

  it("REGRESSION: south in world maps to image-DOWN (higher y) on a north-up image", () => {
    const r = gpsToImageCoords(NORTH_UP_CAL, {
      lat: 42.0 - 100 * LAT_PER_METER, // 100 m south of tee
      lng: -87.0,
    });
    expect(r.y).toBeGreaterThan(0.9);
    expect(r.x).toBeCloseTo(0.5, 6);
  });

  it("returns p1 image coords when calibration is degenerate (p1==p2)", () => {
    const degen = {
      p1_lat: 42.0,
      p1_lng: -87.0,
      p1_x: 0.5,
      p1_y: 0.5,
      p2_lat: 42.0,
      p2_lng: -87.0,
      p2_x: 0.5,
      p2_y: 0.5,
    };
    const r = gpsToImageCoords(degen, { lat: 42.001, lng: -87.0 });
    expect(r).toEqual({ x: 0.5, y: 0.5 });
  });

  it("handles a rotated image (north pointing to image-right)", () => {
    // Tee left-center, green right-center, green still real-world-north of tee
    const cal = {
      p1_lat: 42.0,
      p1_lng: -87.0,
      p1_x: 0.1,
      p1_y: 0.5,
      p2_lat: 42.0 + 300 * LAT_PER_METER,
      p2_lng: -87.0,
      p2_x: 0.9,
      p2_y: 0.5,
    };
    // In this orientation, world EAST should map to image-DOWN (y increases)
    const r = gpsToImageCoords(cal, {
      lat: 42.0,
      lng: -87.0 + 10 * LNG_PER_METER_AT_42,
    });
    expect(r.y).toBeGreaterThan(0.5);
  });
});

describe("clampPixel", () => {
  it("passes through in-range values", () => {
    expect(clampPixel({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
  });

  it("clamps below 0", () => {
    expect(clampPixel({ x: -0.2, y: -0.5 })).toEqual({ x: 0, y: 0 });
  });

  it("clamps above 1", () => {
    expect(clampPixel({ x: 1.7, y: 2.2 })).toEqual({ x: 1, y: 1 });
  });
});

describe("imageUnitsPerMeter", () => {
  it("returns positive scale for non-degenerate calibration", () => {
    const scale = imageUnitsPerMeter(NORTH_UP_CAL);
    expect(scale).toBeGreaterThan(0);
    // For a 300m tee-to-green spanning image distance 0.8 → ~0.0027
    expect(scale).toBeCloseTo(0.8 / 300, 3);
  });

  it("returns 0 for a degenerate calibration", () => {
    const degen = {
      p1_lat: 42.0,
      p1_lng: -87.0,
      p1_x: 0.5,
      p1_y: 0.5,
      p2_lat: 42.0,
      p2_lng: -87.0,
      p2_x: 0.5,
      p2_y: 0.5,
    };
    expect(imageUnitsPerMeter(degen)).toBe(0);
  });
});

describe("buildCirclePolygon", () => {
  it("produces the requested number of vertices", () => {
    const ring = buildCirclePolygon(NORTH_UP_CAL, { x: 0.5, y: 0.5 }, 2, 12);
    expect(ring).toHaveLength(12);
  });

  it("vertices are equidistant from the centre (a true circle)", () => {
    const center = { x: 0.5, y: 0.5 };
    const ring = buildCirclePolygon(NORTH_UP_CAL, center, 2, 12);
    const radii = ring.map((p) =>
      Math.hypot(p.x - center.x, p.y - center.y),
    );
    // All radii should be the same (within 1e-9) for unclamped vertices.
    // (Edges of the image could clamp some — center 0.5/0.5 is safe.)
    const minR = Math.min(...radii);
    const maxR = Math.max(...radii);
    expect(maxR - minR).toBeLessThan(1e-9);
  });

  it("returns empty array if scale is zero", () => {
    const degen = {
      p1_lat: 42.0,
      p1_lng: -87.0,
      p1_x: 0.5,
      p1_y: 0.5,
      p2_lat: 42.0,
      p2_lng: -87.0,
      p2_x: 0.5,
      p2_y: 0.5,
    };
    expect(buildCirclePolygon(degen, { x: 0.5, y: 0.5 }, 2, 12)).toEqual([]);
  });
});

describe("isCalibrationUsable", () => {
  it("returns true for a valid calibration", () => {
    expect(isCalibrationUsable(NORTH_UP_CAL)).toBe(true);
  });

  it("returns false for null/undefined", () => {
    expect(isCalibrationUsable(null)).toBe(false);
    expect(isCalibrationUsable(undefined)).toBe(false);
  });

  it("returns false when the two reference points are coincident", () => {
    expect(
      isCalibrationUsable({
        p1_lat: 42.0,
        p1_lng: -87.0,
        p2_lat: 42.0,
        p2_lng: -87.0,
      }),
    ).toBe(false);
  });

  it("returns false when reference points are <1 m apart", () => {
    expect(
      isCalibrationUsable({
        p1_lat: 42.0,
        p1_lng: -87.0,
        p2_lat: 42.0 + 0.5 * LAT_PER_METER,
        p2_lng: -87.0,
      }),
    ).toBe(false);
  });
});
