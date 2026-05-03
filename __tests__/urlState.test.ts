import { describe, it, expect } from "vitest";
import { filtersFromParams, stateToParams } from "@/lib/urlState";
import { DEFAULT_FILTERS } from "@/types";

describe("filtersFromParams", () => {
  it("returns default filters for empty params", () => {
    const result = filtersFromParams(new URLSearchParams());
    expect(result.filters).toEqual(DEFAULT_FILTERS);
    expect(result.filterByBounds).toBe(false);
    expect(result.mapPosition).toBeNull();
  });

  it("parses kurstyp", () => {
    const result = filtersFromParams(new URLSearchParams("kt=1"));
    expect(result.filters.kurstyp).toBe(1);
  });

  it("parses comma-separated number arrays", () => {
    const result = filtersFromParams(new URLSearchParams("kat=1,2,3&ft=2"));
    expect(result.filters.kategorien).toEqual([1, 2, 3]);
    expect(result.filters.ferientyp).toEqual([2]);
  });

  it("parses geschlecht", () => {
    const result = filtersFromParams(new URLSearchParams("g=3"));
    expect(result.filters.geschlecht).toBe(3);
  });

  it("parses check1 flag", () => {
    const result = filtersFromParams(new URLSearchParams("frei=1"));
    expect(result.filters.check1).toBe(true);
  });

  it("parses filterByBounds", () => {
    const result = filtersFromParams(new URLSearchParams("bounds=1"));
    expect(result.filterByBounds).toBe(true);
  });

  it("parses map position", () => {
    const result = filtersFromParams(new URLSearchParams("mlat=47.38&mlng=8.54&mz=14"));
    expect(result.mapPosition).toEqual({ lat: 47.38, lng: 8.54, zoom: 14 });
  });

  it("returns null map position if any coordinate is missing", () => {
    const result = filtersFromParams(new URLSearchParams("mlat=47.38&mlng=8.54"));
    expect(result.mapPosition).toBeNull();
  });
});

describe("stateToParams", () => {
  it("produces empty string for default state", () => {
    const p = stateToParams(DEFAULT_FILTERS, false, null);
    expect(p.toString()).toBe("");
  });

  it("encodes non-default kurstyp", () => {
    const p = stateToParams({ ...DEFAULT_FILTERS, kurstyp: 1 }, false, null);
    expect(p.get("kt")).toBe("1");
  });

  it("encodes array filters", () => {
    const p = stateToParams({ ...DEFAULT_FILTERS, kategorien: [1, 3] }, false, null);
    expect(p.get("kat")).toBe("1,3");
  });

  it("encodes check1", () => {
    const p = stateToParams({ ...DEFAULT_FILTERS, check1: true }, false, null);
    expect(p.get("frei")).toBe("1");
  });

  it("encodes map position with 5 decimal places", () => {
    const p = stateToParams(DEFAULT_FILTERS, false, { lat: 47.3769, lng: 8.5417, zoom: 13 });
    expect(p.get("mlat")).toBe("47.37690");
    expect(p.get("mlng")).toBe("8.54170");
    expect(p.get("mz")).toBe("13");
  });

  it("round-trips through filtersFromParams", () => {
    const original = {
      filters: { ...DEFAULT_FILTERS, kurstyp: 1, kategorien: [2], check1: true },
      filterByBounds: true,
      mapPosition: { lat: 47.38, lng: 8.54, zoom: 15 },
    };
    const params = stateToParams(original.filters, original.filterByBounds, original.mapPosition);
    const parsed = filtersFromParams(params);
    expect(parsed.filters.kurstyp).toBe(1);
    expect(parsed.filters.kategorien).toEqual([2]);
    expect(parsed.filters.check1).toBe(true);
    expect(parsed.filterByBounds).toBe(true);
    expect(parsed.mapPosition?.zoom).toBe(15);
  });
});
