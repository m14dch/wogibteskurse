import { describe, it, expect } from "vitest";
import { stateToParams, filtersFromParams } from "@/lib/urlState";
import { DEFAULT_FILTERS } from "@/types";

// Keys the wizard uses to detect whether filters are already set (from MapPage.tsx).
// This test ensures those keys stay aligned with what stateToParams actually produces.
const WIZARD_FILTER_KEYS = ["kt", "ft", "fw", "jg", "akt", "kat", "sk"];

function wizardWouldShow(params: URLSearchParams): boolean {
  return !WIZARD_FILTER_KEYS.some((k) => params.has(k));
}

describe("wizard first-visit detection", () => {
  it("does not show wizard when kurstyp param is set", () => {
    const filters = { ...DEFAULT_FILTERS, kurstyp: 1 };
    const params = stateToParams(filters, false, null);
    expect(params.has("kt")).toBe(true);
    expect(wizardWouldShow(params)).toBe(false);
  });

  it("does not show wizard when ferientyp param is set", () => {
    const filters = { ...DEFAULT_FILTERS, ferientyp: [3] };
    const params = stateToParams(filters, false, null);
    expect(params.has("ft")).toBe(true);
    expect(wizardWouldShow(params)).toBe(false);
  });

  it("does not show wizard when ferienwochen param is set", () => {
    const filters = { ...DEFAULT_FILTERS, ferienwochen: [1] };
    const params = stateToParams(filters, false, null);
    expect(params.has("fw")).toBe(true);
    expect(wizardWouldShow(params)).toBe(false);
  });

  it("does not show wizard when jahrgaenge param is set", () => {
    const filters = { ...DEFAULT_FILTERS, jahrgaenge: [2015] };
    const params = stateToParams(filters, false, null);
    expect(params.has("jg")).toBe(true);
    expect(wizardWouldShow(params)).toBe(false);
  });

  it("does not show wizard when aktivitaeten param is set", () => {
    const filters = { ...DEFAULT_FILTERS, aktivitaeten: [7] };
    const params = stateToParams(filters, false, null);
    expect(params.has("akt")).toBe(true);
    expect(wizardWouldShow(params)).toBe(false);
  });

  it("does not show wizard when kategorien param is set", () => {
    const filters = { ...DEFAULT_FILTERS, kategorien: [2] };
    const params = stateToParams(filters, false, null);
    expect(params.has("kat")).toBe(true);
    expect(wizardWouldShow(params)).toBe(false);
  });

  it("does not show wizard when schulkreis param is set", () => {
    const filters = { ...DEFAULT_FILTERS, schulkreis: [1] };
    const params = stateToParams(filters, false, null);
    expect(params.has("sk")).toBe(true);
    expect(wizardWouldShow(params)).toBe(false);
  });

  it("shows wizard when only non-filter params are set (map position, bounds)", () => {
    const params = stateToParams(DEFAULT_FILTERS, true, { lat: 47.38, lng: 8.54, zoom: 13 });
    expect(wizardWouldShow(params)).toBe(true);
  });

  it("shows wizard when params are empty", () => {
    expect(wizardWouldShow(new URLSearchParams())).toBe(true);
  });
});

describe("wizard initialValues pre-population", () => {
  it("round-trips kurstyp, ferientyp, ferienwochen, jahrgaenge through URL params", () => {
    const original = {
      ...DEFAULT_FILTERS,
      kurstyp: 1,
      ferientyp: [2, 3],
      ferienwochen: [5],
      jahrgaenge: [2015, 2016],
    };
    const params = stateToParams(original, false, null);
    const restored = filtersFromParams(params).filters;
    expect(restored.kurstyp).toBe(1);
    expect(restored.ferientyp).toEqual([2, 3]);
    expect(restored.ferienwochen).toEqual([5]);
    expect(restored.jahrgaenge).toEqual([2015, 2016]);
  });
});
