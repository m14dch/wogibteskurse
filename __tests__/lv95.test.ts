import { describe, it, expect } from "vitest";
import { lv95ToWgs84 } from "@/lib/lv95";

// Reference values from swisstopo "Approximate formulas for the transformation
// between Swiss projection coordinates and WGS84". The formula is accurate to
// ~1 m in central Switzerland, so we allow ±0.001° (≈ 100 m) for concrete
// city tests.
const TOLERANCE = 0.001;

describe("lv95ToWgs84", () => {
  it("maps the LV95 origin (Bern Old Observatory) to ~46.951° N, 7.439° E", () => {
    const { lat, lng } = lv95ToWgs84(2_600_000, 1_200_000);
    expect(lat).toBeCloseTo(46.9511, 2);
    expect(lng).toBeCloseTo(7.4386, 2);
  });

  it("places Zürich Hauptbahnhof within 100 m of 47.378° N, 8.540° E", () => {
    // LV95 for Zürich HB: E=2683138, N=1248082
    const { lat, lng } = lv95ToWgs84(2_683_138, 1_248_082);
    expect(Math.abs(lat - 47.378)).toBeLessThan(TOLERANCE);
    expect(Math.abs(lng - 8.54)).toBeLessThan(TOLERANCE);
  });

  it("moving east increases longitude and moving north increases latitude", () => {
    const origin = lv95ToWgs84(2_650_000, 1_200_000);
    const east = lv95ToWgs84(2_660_000, 1_200_000);
    const north = lv95ToWgs84(2_650_000, 1_210_000);
    expect(east.lng).toBeGreaterThan(origin.lng);
    expect(east.lat).toBeCloseTo(origin.lat, 2);
    expect(north.lat).toBeGreaterThan(origin.lat);
    expect(north.lng).toBeCloseTo(origin.lng, 2);
  });

  it("returns values in the valid WGS84 range for Switzerland", () => {
    // Any valid Swiss LV95 point should land within Switzerland's bounding box
    const { lat, lng } = lv95ToWgs84(2_650_000, 1_200_000);
    expect(lat).toBeGreaterThan(45.8);
    expect(lat).toBeLessThan(47.9);
    expect(lng).toBeGreaterThan(5.9);
    expect(lng).toBeLessThan(10.5);
  });
});
