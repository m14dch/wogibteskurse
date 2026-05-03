import type { Filters } from "@/types";
import { DEFAULT_FILTERS } from "@/types";

export interface MapPosition {
  lat: number;
  lng: number;
  zoom: number;
}

function parseInts(s: string | null): number[] {
  if (!s) return [];
  return s
    .split(",")
    .map(Number)
    .filter((n) => !isNaN(n));
}

export function filtersFromParams(p: URLSearchParams): {
  filters: Filters;
  filterByBounds: boolean;
  mapPosition: MapPosition | null;
} {
  const lat = p.has("mlat") ? Number(p.get("mlat")) : null;
  const lng = p.has("mlng") ? Number(p.get("mlng")) : null;
  const zoom = p.has("mz") ? Number(p.get("mz")) : null;
  return {
    filters: {
      kurstyp: Number(p.get("kt") ?? DEFAULT_FILTERS.kurstyp),
      ferientyp: parseInts(p.get("ft")),
      ferienwochen: parseInts(p.get("fw")),
      aktivitaeten: parseInts(p.get("akt")),
      schulkreis: parseInts(p.get("sk")),
      kategorien: parseInts(p.get("kat")),
      jahrgaenge: parseInts(p.get("jg")),
      geschlecht: p.has("g") ? Number(p.get("g")) : null,
      check1: p.get("frei") === "1",
    },
    filterByBounds: p.get("bounds") === "1",
    mapPosition: lat !== null && lng !== null && zoom !== null ? { lat, lng, zoom } : null,
  };
}

export function stateToParams(
  filters: Filters,
  filterByBounds: boolean,
  mapPosition: MapPosition | null
): URLSearchParams {
  const p = new URLSearchParams();
  if (filters.kurstyp !== DEFAULT_FILTERS.kurstyp) p.set("kt", String(filters.kurstyp));
  if (filters.ferientyp.length) p.set("ft", filters.ferientyp.join(","));
  if (filters.ferienwochen.length) p.set("fw", filters.ferienwochen.join(","));
  if (filters.aktivitaeten.length) p.set("akt", filters.aktivitaeten.join(","));
  if (filters.schulkreis.length) p.set("sk", filters.schulkreis.join(","));
  if (filters.kategorien.length) p.set("kat", filters.kategorien.join(","));
  if (filters.jahrgaenge.length) p.set("jg", filters.jahrgaenge.join(","));
  if (filters.geschlecht !== null) p.set("g", String(filters.geschlecht));
  if (filters.check1) p.set("frei", "1");
  if (filterByBounds) p.set("bounds", "1");
  if (mapPosition) {
    p.set("mlat", mapPosition.lat.toFixed(5));
    p.set("mlng", mapPosition.lng.toFixed(5));
    p.set("mz", String(mapPosition.zoom));
  }
  return p;
}
