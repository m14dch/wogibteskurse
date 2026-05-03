import { describe, it, expect } from "vitest";
import VENUE_OVERRIDES from "../lib/venue-overrides.json";

// Bounding box that covers greater Zürich area plus Tenero (national sports centre)
const SWITZERLAND_BOUNDS = { latMin: 45.8, latMax: 47.9, lngMin: 5.9, lngMax: 10.5 };
const ZURICH_BOUNDS = { latMin: 47.3, latMax: 47.45, lngMin: 8.43, lngMax: 8.63 };
const OUTSIDE_ZURICH_VENUES = new Set(["ZSF Ferienhaus Colonia Zurighese"]);

describe("VENUE_OVERRIDES", () => {
  it("has no duplicate venue names", () => {
    const names = VENUE_OVERRIDES.map((o) => o.name);
    const unique = new Set(names);
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates, `Duplicate names: ${duplicates.join(", ")}`).toHaveLength(0);
    expect(unique.size).toBe(VENUE_OVERRIDES.length);
  });

  it("all entries have non-empty names", () => {
    const empty = VENUE_OVERRIDES.filter((o) => !o.name.trim());
    expect(empty).toHaveLength(0);
  });

  it("all entries have non-empty notes", () => {
    const missing = VENUE_OVERRIDES.filter((o) => !o.note?.trim());
    expect(missing.map((o) => o.name)).toHaveLength(0);
  });

  it("all coordinates are valid numbers", () => {
    for (const o of VENUE_OVERRIDES) {
      expect(typeof o.lat, `${o.name}: lat must be number`).toBe("number");
      expect(typeof o.lng, `${o.name}: lng must be number`).toBe("number");
      expect(isFinite(o.lat), `${o.name}: lat must be finite`).toBe(true);
      expect(isFinite(o.lng), `${o.name}: lng must be finite`).toBe(true);
    }
  });

  it("all coordinates are within Switzerland", () => {
    const outOfBounds = VENUE_OVERRIDES.filter(
      (o) =>
        o.lat < SWITZERLAND_BOUNDS.latMin ||
        o.lat > SWITZERLAND_BOUNDS.latMax ||
        o.lng < SWITZERLAND_BOUNDS.lngMin ||
        o.lng > SWITZERLAND_BOUNDS.lngMax
    );
    expect(outOfBounds.map((o) => `${o.name} (${o.lat}, ${o.lng})`)).toHaveLength(0);
  });

  it("all Zürich venues are within greater Zürich bounds", () => {
    // Entries without an explicit out-of-Zürich exception should be in greater Zürich area.
    const nonZurich = VENUE_OVERRIDES.filter(
      (o) =>
        !OUTSIDE_ZURICH_VENUES.has(o.name) &&
        (o.lat < ZURICH_BOUNDS.latMin ||
          o.lat > ZURICH_BOUNDS.latMax ||
          o.lng < ZURICH_BOUNDS.lngMin ||
          o.lng > ZURICH_BOUNDS.lngMax)
    );
    expect(nonZurich.map((o) => `${o.name} (${o.lat}, ${o.lng})`)).toHaveLength(0);
  });

  it("does not contain the city-centre fallback coordinates", () => {
    // 47.3769, 8.5417 is the fallback for unresolvable venues — should never be an override
    const fallback = VENUE_OVERRIDES.filter(
      (o) => Math.abs(o.lat - 47.3769) < 0.001 && Math.abs(o.lng - 8.5417) < 0.001
    );
    expect(fallback.map((o) => o.name)).toHaveLength(0);
  });
});
