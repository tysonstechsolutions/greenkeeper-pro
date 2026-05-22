/**
 * GPS → image-pixel mapping for hole observations.
 *
 * Given two calibration reference points (each having both image-relative
 * coords in [0, 1] and real-world lat/lng), we can derive a similarity
 * transform (uniform scale + rotation + translation, no shear) that maps
 * any real-world GPS reading onto the same image-relative coordinate
 * system used by hole_observations.pin_x/y and green_observations.pin_x/y.
 *
 * For the small scales involved on a single golf hole (≤ a few hundred
 * meters), an equirectangular projection of (lat, lng) → meters is
 * accurate to well within phone-GPS noise (~5–15 m). No need for spherical
 * trig.
 */
import type { HoleGpsCalibration } from "@/types/database";

const EARTH_RADIUS_M = 6_378_137;

/** Convert (lat, lng) → planar (east_m, north_m) using a local
 * equirectangular projection centred on `refLat`. East is +x, North is +y. */
function latLngToLocalMeters(
  lat: number,
  lng: number,
  refLat: number,
): { east: number; north: number } {
  const latRad = (lat * Math.PI) / 180;
  const refRad = (refLat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  return {
    east: EARTH_RADIUS_M * Math.cos(refRad) * lngRad,
    north: EARTH_RADIUS_M * latRad,
  };
}

export interface PixelPoint {
  /** Image-relative X in [0, 1]. */
  x: number;
  /** Image-relative Y in [0, 1]. */
  y: number;
}

/**
 * Map a real-world GPS reading onto the image's 0-1 coordinate system using
 * a 2-point similarity transform derived from the calibration row.
 *
 * Math: build vectors A = p2_img - p1_img (in image coords) and
 *       B = p2_world - p1_world (in meters, east/north).
 * The similarity transform that sends B → A is:
 *   T(world) = M · (world - p1_world) + p1_img
 * where M is the 2×2 matrix with scale = |A| / |B| and rotation = angle(A) - angle(B).
 * We compute M directly from the cross/dot products of A and B to avoid
 * computing the angle and re-applying sin/cos.
 *
 * NOTE: the returned (x, y) is **not clamped** to [0, 1] — callers that
 * need to render a pin should clamp themselves, since a GPS reading
 * outside the calibrated area might still be useful as a "user is far
 * from this hole" signal.
 */
export function gpsToImageCoords(
  calibration: Pick<
    HoleGpsCalibration,
    "p1_lat" | "p1_lng" | "p1_x" | "p1_y" | "p2_lat" | "p2_lng" | "p2_x" | "p2_y"
  >,
  current: { lat: number; lng: number },
): PixelPoint {
  // Reference latitude for the local projection: use p1 so the projection
  // matches the calibration reference. Inputs are converted into a small
  // local Cartesian patch centred on (p1_lat, 0).
  const refLat = calibration.p1_lat;
  const p1w = latLngToLocalMeters(calibration.p1_lat, calibration.p1_lng, refLat);
  const p2w = latLngToLocalMeters(calibration.p2_lat, calibration.p2_lng, refLat);
  const cw = latLngToLocalMeters(current.lat, current.lng, refLat);

  // Vectors in world (meters) — origin at p1
  const Bx = p2w.east - p1w.east;
  const By = p2w.north - p1w.north;
  // Vectors in image (relative 0-1) — origin at p1.
  // jsPDF and HTML images share the convention that Y grows DOWNWARD, so
  // a "north" world vector should map to a NEGATIVE image-Y delta.
  const Ax = calibration.p2_x - calibration.p1_x;
  const Ay = calibration.p2_y - calibration.p1_y;

  // |B|² — used as denominator. Guard against degenerate calibrations
  // where the two reference points coincide.
  const bLenSq = Bx * Bx + By * By;
  if (bLenSq < 1e-9) {
    return { x: calibration.p1_x, y: calibration.p1_y };
  }

  // Solve the similarity that sends B → A.
  // If A = M·B with M = [[c, -s], [s, c]] (rotation+scale), then:
  //   c = (Ax·Bx + Ay·By) / |B|²
  //   s = (Ay·Bx - Ax·By) / |B|²
  // Note the sign flip on s vs the standard math convention because image
  // Y points down while our local "north" projection points up.
  const c = (Ax * Bx + Ay * By) / bLenSq;
  const s = (Ay * Bx - Ax * By) / bLenSq;

  // World-space offset from the calibration origin.
  const dx = cw.east - p1w.east;
  const dy = cw.north - p1w.north;

  // Apply M to (dx, dy) and translate to p1_img.
  const x = c * dx - s * dy + calibration.p1_x;
  const y = s * dx + c * dy + calibration.p1_y;

  return { x, y };
}

/** Convenience: clamp pixel coords to [0, 1] for pin rendering. */
export function clampPixel(p: PixelPoint): PixelPoint {
  return {
    x: Math.max(0, Math.min(1, p.x)),
    y: Math.max(0, Math.min(1, p.y)),
  };
}

/**
 * Image-relative units per real-world meter, derived from the calibration's
 * two reference points. A typical golf hole is ~300m long and the image
 * spans width 1, so scale is roughly 1/300 = 0.003 per meter — small but
 * nonzero. For greens (~30m wide) the scale is ~10× higher.
 *
 * Useful for converting a "1 meter radius" into image-relative units so we
 * can draw correctly-sized rings, default-size polygons, or accuracy
 * indicators on the hole image.
 */
export function imageUnitsPerMeter(
  calibration: Pick<
    HoleGpsCalibration,
    "p1_lat" | "p1_lng" | "p1_x" | "p1_y" | "p2_lat" | "p2_lng" | "p2_x" | "p2_y"
  >,
): number {
  const refLat = calibration.p1_lat;
  const p1w = latLngToLocalMeters(calibration.p1_lat, calibration.p1_lng, refLat);
  const p2w = latLngToLocalMeters(calibration.p2_lat, calibration.p2_lng, refLat);
  const worldDist = Math.hypot(p2w.east - p1w.east, p2w.north - p1w.north);
  if (worldDist < 1e-6) return 0;
  const imgDist = Math.hypot(
    calibration.p2_x - calibration.p1_x,
    calibration.p2_y - calibration.p1_y,
  );
  return imgDist / worldDist;
}

/**
 * Build a closed ring polygon of `vertexCount` vertices, centred on
 * `centerImg` (image-relative), with the supplied real-world radius (in
 * meters). Used to seed a freehand-drawn green area when the user picks
 * "Use My Location" instead of drawing manually.
 *
 * Polygon is approximately circular in real-world space, NOT in image
 * space, so a green that's been compressed in the image will still get a
 * geometrically-correct circular ring on the satellite map. Both
 * are equivalent when the image is roughly to-scale, which it is for our
 * use case.
 */
export function buildCirclePolygon(
  calibration: Pick<
    HoleGpsCalibration,
    "p1_lat" | "p1_lng" | "p1_x" | "p1_y" | "p2_lat" | "p2_lng" | "p2_x" | "p2_y"
  >,
  centerImg: PixelPoint,
  radiusMeters: number,
  vertexCount = 12,
): PixelPoint[] {
  const scale = imageUnitsPerMeter(calibration);
  if (scale <= 0 || radiusMeters <= 0) return [];
  const r = radiusMeters * scale;
  const out: PixelPoint[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const ang = (i / vertexCount) * Math.PI * 2;
    out.push({
      x: Math.max(0, Math.min(1, centerImg.x + r * Math.cos(ang))),
      y: Math.max(0, Math.min(1, centerImg.y + r * Math.sin(ang))),
    });
  }
  return out;
}

/**
 * True when both reference points have valid coordinates and the two
 * world points aren't coincident (which would make the transform
 * singular).
 */
export function isCalibrationUsable(
  calibration: Pick<
    HoleGpsCalibration,
    "p1_lat" | "p1_lng" | "p2_lat" | "p2_lng"
  > | null | undefined,
): boolean {
  if (!calibration) return false;
  const refLat = calibration.p1_lat;
  const p1 = latLngToLocalMeters(calibration.p1_lat, calibration.p1_lng, refLat);
  const p2 = latLngToLocalMeters(calibration.p2_lat, calibration.p2_lng, refLat);
  const distSq = (p2.east - p1.east) ** 2 + (p2.north - p1.north) ** 2;
  // Reference points more than 1 m apart — otherwise the transform is
  // numerically unstable.
  return distSq > 1;
}
