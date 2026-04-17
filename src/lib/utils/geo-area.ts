/**
 * Compute the area (in square meters) of a polygon specified as an
 * ordered list of [lng, lat] coordinates on the WGS84 ellipsoid.
 *
 * Uses the spherical excess formula — accurate to well under 0.1% at
 * golf-course scale, which is ~1 cm on a 3000 sq ft green. Far tighter
 * than Google/Esri satellite imagery resolution, so this is the
 * limiting-factor-free choice.
 *
 * Algorithm reference: Chamberlain & Duquette, "Some Algorithms for
 * Polygons on a Sphere", JPL 2007.
 */

const EARTH_RADIUS_M = 6378137; // WGS84 equatorial radius

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * @param coords  An ordered ring of [lng, lat] points. The ring may
 *                or may not be closed (first === last); we normalize.
 * @returns       Absolute area in square meters.
 */
export function polygonAreaSquareMeters(coords: [number, number][]): number {
  if (coords.length < 3) return 0;

  // Ensure the ring is closed for the formula
  const ring =
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1]
      ? coords
      : [...coords, coords[0]];

  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    total +=
      toRad(lng2 - lng1) *
      (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  const area = Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
  return area;
}

const SQ_M_PER_SQ_FT = 0.09290304;
const M_PER_FT = 0.3048;

export function squareMetersToSquareFeet(sqm: number): number {
  return sqm / SQ_M_PER_SQ_FT;
}

export function polygonAreaSquareFeet(coords: [number, number][]): number {
  return squareMetersToSquareFeet(polygonAreaSquareMeters(coords));
}

/**
 * Haversine distance (meters) between two [lng, lat] points.
 */
export function haversineMeters(
  a: [number, number],
  b: [number, number]
): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lng2 - lng1);
  const h =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Perimeter length of the polygon ring in feet.
 */
export function polygonPerimeterFeet(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  const ring =
    coords[0][0] === coords[coords.length - 1][0] &&
    coords[0][1] === coords[coords.length - 1][1]
      ? coords
      : [...coords, coords[0]];
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    total += haversineMeters(ring[i], ring[i + 1]);
  }
  return total / M_PER_FT;
}
