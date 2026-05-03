/**
 * Approximate LV95 → WGS84 conversion using the swisstopo polynomial formula.
 * Accurate to ~1 m within Switzerland. Inputs must be valid LV95 coordinates
 * (easting > 2_000_000, northing > 1_000_000).
 *
 * Reference: swisstopo "Approximate formulas for the transformation between
 * Swiss projection coordinates and WGS84" (swisstopo.admin.ch).
 *
 * NOTE: an identical copy of this function lives in scripts/seed-course-cache.mjs
 * (which cannot import TypeScript). Keep both in sync.
 */
export function lv95ToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const y = (easting - 2_600_000) / 1_000_000;
  const x = (northing - 1_200_000) / 1_000_000;

  const latRaw =
    16.9023892 +
    3.238272 * x -
    0.270978 * y * y -
    0.002528 * x * x -
    0.0447 * y * y * x -
    0.014 * x * x * x;

  const lngRaw =
    2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;

  return { lat: (latRaw * 100) / 36, lng: (lngRaw * 100) / 36 };
}
