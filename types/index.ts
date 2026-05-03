import type { Course } from "@/lib/sportPortal";

export interface EnrichedCourse extends Course {
  lat: number | null;
  lng: number | null;
  approximate: boolean;
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Filters {
  kurstyp: number;
  ferientyp: number[];
  ferienwochen: number[];
  aktivitaeten: number[];
  schulkreis: number[];
  kategorien: number[];
  jahrgaenge: number[];
  geschlecht: number | null;
  check1: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  kurstyp: 2,
  ferientyp: [],
  ferienwochen: [],
  aktivitaeten: [],
  schulkreis: [],
  kategorien: [],
  jahrgaenge: [],
  geschlecht: null,
  check1: false,
};

// Color per kategorie
export const KATEGORIE_COLORS: Record<number, string> = {
  1: "#16a34a", // Freizeit → green
  2: "#2563eb", // Sport → blue
  3: "#ea580c", // Kombi → orange
  4: "#7c3aed", // Online → purple
};

export const DEFAULT_COLOR = "#6b7280";
