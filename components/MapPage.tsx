"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EnrichedCourse, Bounds, Filters } from "@/types";
import type { LookupOption } from "@/lib/sportPortal";
import { filtersFromParams, stateToParams, type MapPosition } from "@/lib/urlState";
import FilterPanel from "./FilterPanel";
import CourseList from "./CourseList";
import CoursePopup from "./CoursePopup";
import WizardModal from "./WizardModal";
import type { MapViewHandle } from "./MapView";

// Leaflet must not run on the server
const MapView = dynamic(() => import("./MapView"), { ssr: false });

interface Lookups {
  aktivitaet: LookupOption[];
  ferientyp: LookupOption[];
  ferienwoche: LookupOption[];
  schulkreis: LookupOption[];
  kategorie: LookupOption[];
  jahrgangferien: LookupOption[];
  geschlecht: LookupOption[];
}

export default function MapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initial = filtersFromParams(searchParams);

  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [filterByBounds, setFilterByBounds] = useState(initial.filterByBounds);
  const [mapPosition, setMapPosition] = useState<MapPosition | null>(initial.mapPosition);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [courses, setCourses] = useState<EnrichedCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [pinnedGroup, setPinnedGroup] = useState<EnrichedCourse[] | null>(null);
  const [detailCourse, setDetailCourse] = useState<EnrichedCourse | null>(null);
  const [locating, setLocating] = useState<"idle" | "loading" | "error">("idle");
  const [showWizard, setShowWizard] = useState(false);

  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchController = useRef<AbortController | null>(null);
  const mapRef = useRef<MapViewHandle | null>(null);
  const detailScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (detailCourse) detailScrollRef.current?.scrollTo({ top: 0 });
  }, [detailCourse]);

  useEffect(() => {
    fetch("/api/lookups")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Filter konnten nicht geladen werden.");
        return json;
      })
      .then(setLookups)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Filter konnten nicht geladen werden.")
      );
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const hasFilters = ["kt", "ft", "fw", "jg", "akt", "kat", "sk"].some((k) => p.has(k));
    if (!hasFilters && !localStorage.getItem("wizardSeen")) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowWizard(true);
    }
  }, []);

  const handleLocate = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocating("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating("idle");
        mapRef.current?.flyTo(coords.latitude, coords.longitude);
      },
      () => {
        setLocating("error");
        setTimeout(() => setLocating("idle"), 2500);
      },
      { timeout: 8000 }
    );
  }, []);

  const fetchCourses = useCallback(
    (currentFilters: Filters, currentBounds: Bounds | null, useBounds: boolean) => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
      fetchTimer.current = setTimeout(async () => {
        fetchController.current?.abort();
        const controller = new AbortController();
        fetchController.current = controller;
        setLoading(true);
        setError(null);
        try {
          const body = {
            ...currentFilters,
            ...(useBounds && currentBounds ? { bounds: currentBounds } : {}),
          };
          const res = await fetch("/api/courses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify(body),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Unbekannter Fehler");
          setCourses(json.results);
          setSelectedId(null);
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          setError(err instanceof Error ? err.message : "Fehler beim Laden der Kurse.");
        } finally {
          if (fetchController.current === controller) {
            fetchController.current = null;
            setLoading(false);
          }
        }
      }, 400);
    },
    []
  );

  useEffect(() => {
    fetchCourses(filters, bounds, filterByBounds);
  }, [filters, filterByBounds, bounds, fetchCourses]);

  useEffect(() => {
    const qs = stateToParams(filters, filterByBounds, mapPosition).toString();
    router.replace(qs ? `?${qs}` : "/", { scroll: false });
  }, [filters, filterByBounds, mapPosition, router]);

  const handleBoundsChange = useCallback((b: Bounds) => setBounds(b), []);
  const handleMapReady = useCallback((b: Bounds) => setBounds(b), []);
  const handlePositionChange = useCallback(
    (lat: number, lng: number, zoom: number) => setMapPosition({ lat, lng, zoom }),
    []
  );

  // On mobile the bottom sheet covers 60dvh when expanded — offset flyTo so the pin
  // lands in the visible area above the sheet rather than behind it
  const mobileSheetPadding = () => (window.innerWidth < 1024 ? window.innerHeight * 0.6 : 0);

  const handleSelectCourse = useCallback((course: EnrichedCourse) => {
    setSelectedId(course.angebotId);
    setDetailCourse(course);
    setPinnedGroup(null);
    if (course.lat !== null && course.lng !== null) {
      mapRef.current?.flyTo(course.lat, course.lng, mobileSheetPadding());
    }
    setSheetExpanded(true);
  }, []);

  const handlePinnedCourseSelect = useCallback((course: EnrichedCourse) => {
    setSelectedId(course.angebotId);
    setDetailCourse(course);
    // No flyTo: the map is already centered on the group pin (same coordinates).
    // Flying again to the same position causes a jiggle.
  }, []);

  const handleGroupSelect = useCallback((group: EnrichedCourse[]) => {
    const [first] = group;
    setPinnedGroup(group);
    setDetailCourse(null);
    setSelectedId(first.angebotId);
    setSheetExpanded(true);
    if (first.lat !== null && first.lng !== null) {
      mapRef.current?.flyTo(first.lat, first.lng, mobileSheetPadding());
    }
  }, []);

  const closeWizard = useCallback(() => {
    localStorage.setItem("wizardSeen", "1");
    setShowWizard(false);
  }, []);

  const openWizard = useCallback(() => {
    localStorage.removeItem("wizardSeen");
    setShowWizard(true);
  }, []);

  const handleWizardComplete = useCallback(
    (wizardFilters: Partial<Filters>) => {
      setFilters((prev) => ({ ...prev, ...wizardFilters }));
      closeWizard();
    },
    [closeWizard]
  );

  const activeFilterCount =
    (filters.kurstyp !== 2 ? 1 : 0) +
    filters.ferientyp.length +
    filters.ferienwochen.length +
    filters.aktivitaeten.length +
    filters.schulkreis.length +
    filters.kategorien.length +
    filters.jahrgaenge.length +
    (filters.geschlecht !== null ? 1 : 0) +
    (filters.check1 ? 1 : 0) +
    (filterByBounds ? 1 : 0);

  const filterPanel = lookups ? (
    <FilterPanel
      lookups={lookups}
      filters={filters}
      filterByBounds={filterByBounds}
      onChange={setFilters}
      onBoundsToggle={setFilterByBounds}
    />
  ) : (
    <div className="p-4 text-sm text-gray-400">Filter werden geladen…</div>
  );

  const listContent = detailCourse ? (
    <>
      <div className="px-3 py-2 border-b border-blue-100 shrink-0 flex items-center gap-2 bg-blue-50">
        <button
          onClick={() => setDetailCourse(null)}
          className="flex items-center gap-1 text-blue-600 text-xs font-semibold hover:text-blue-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {pinnedGroup
            ? `${pinnedGroup.length} Kurs${pinnedGroup.length !== 1 ? "e" : ""} an diesem Ort`
            : "Kursliste"}
        </button>
      </div>
      <div ref={detailScrollRef} className="flex-1 min-h-0 overflow-y-auto p-4">
        <CoursePopup course={detailCourse} />
      </div>
    </>
  ) : pinnedGroup ? (
    <>
      <div className="px-3 py-2 border-b border-blue-100 shrink-0 flex items-center gap-2 bg-blue-50">
        <button
          onClick={() => setPinnedGroup(null)}
          className="flex items-center gap-1 text-blue-600 text-xs font-semibold hover:text-blue-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Alle Kurse
        </button>
        <span className="text-xs text-blue-700">
          {pinnedGroup.length} Kurs{pinnedGroup.length !== 1 ? "e" : ""} an diesem Ort
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <CourseList
          courses={pinnedGroup}
          selectedId={selectedId}
          onSelect={handlePinnedCourseSelect}
        />
      </div>
    </>
  ) : (
    <>
      <div className="px-3 py-2 border-b border-gray-100 shrink-0 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Kursliste
        </span>
        <span className="text-xs text-gray-400">
          {courses.length} Kurs{courses.length !== 1 ? "e" : ""}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <CourseList courses={courses} selectedId={selectedId} onSelect={handleSelectCourse} />
      </div>
    </>
  );

  return (
    <div className="flex flex-col h-[100dvh] bg-gray-50">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <a
          href="/"
          aria-label="Wo gibt es Kurse? – Startseite"
          className="flex items-center gap-2 shrink-0"
        >
          <img src="/brand/logo-icon.svg" alt="" className="h-7 w-auto" />
          <h1
            className="text-lg font-bold whitespace-nowrap"
            style={{ color: "var(--brand-dark)" }}
          >
            Wo gibt es Kurse?
          </h1>
        </a>
        <div className="ml-auto flex items-center gap-3">
          {loading && (
            <svg
              className="animate-spin h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              aria-label="Laden…"
              style={{ color: "var(--brand-teal)" }}
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          )}
          <a
            href="https://github.com/mathiasaebersold/wogibteskurse"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Quellcode auf GitHub"
            className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
          >
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            <span className="hidden lg:inline text-xs">GitHub</span>
          </a>
          <a
            href="/legal"
            aria-label="Datenschutz & Hinweise"
            className="text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
          >
            <svg
              className="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3.75 5.75 6v4.75c0 4.05 2.57 7.65 6.25 8.95 3.68-1.3 6.25-4.9 6.25-8.95V6L12 3.75Z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v4.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.01" />
            </svg>
            <span className="hidden lg:inline text-xs whitespace-nowrap">Datenschutz</span>
          </a>
          <a
            href="https://www.stadt-zuerich.ch/de/stadtleben/sport-und-erholung/sport-fuer-kinder-jugendliche/kurse.html"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Daten: Stadt Zürich"
            className="flex items-center text-gray-400 hover:text-gray-600 transition-colors"
          >
            {/* Stadt Zürich favicon on mobile; full text on sm+ */}
            <span className="sm:hidden flex items-center gap-1 text-xs whitespace-nowrap">
              Daten:
              <img
                src="https://www.stadt-zuerich.ch/favicon.ico"
                alt="Stadt Zürich"
                className="w-4 h-4 object-contain"
              />
            </span>
            <span className="hidden sm:inline text-xs whitespace-nowrap">
              <span className="hidden lg:inline">Inoffizielle Übersicht · </span>Daten: Stadt Zürich
              ↗
            </span>
          </a>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-72 shrink-0 bg-white border-r border-gray-200 flex-col">
          <div className="shrink-0 px-4 pt-3 pb-2 border-b border-gray-100">
            <button
              onClick={openWizard}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition-colors hover:bg-[#EAF4F1]"
              style={{ color: "var(--brand-teal)", borderColor: "var(--brand-teal)" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                />
              </svg>
              Suche anpassen
            </button>
          </div>
          {filterPanel}
        </aside>

        {/* Map + overlays */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Map area — fills all space on mobile, shares with list panel on desktop */}
          <div className="flex-1 lg:flex-[3] relative min-h-0">
            {/* Locate button */}
            <button
              onClick={handleLocate}
              aria-label="Meinen Standort anzeigen"
              className="absolute top-[80px] left-[10px] z-[1000] bg-white rounded shadow-md p-1.5 border border-gray-300 hover:bg-gray-50 transition-colors"
            >
              {locating === "loading" && (
                <svg
                  className="animate-spin h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ color: "var(--brand-teal)" }}
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
              )}
              {locating === "error" && (
                <svg
                  className="h-5 w-5 text-red-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
              {locating === "idle" && (
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: "var(--brand-teal)" }}
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                  <circle cx="12" cy="12" r="8" strokeDasharray="2 4" />
                </svg>
              )}
            </button>

            {!loading && !error && courses.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[400]">
                <div className="bg-white/90 backdrop-blur-sm rounded-xl shadow-md px-5 py-3 text-sm text-gray-600 border border-gray-200">
                  Keine Kurse in dieser Ansicht
                </div>
              </div>
            )}

            <MapView
              ref={mapRef}
              courses={courses}
              selectedId={selectedId}
              initialCenter={
                initial.mapPosition ? [initial.mapPosition.lat, initial.mapPosition.lng] : undefined
              }
              initialZoom={initial.mapPosition?.zoom}
              onBoundsChange={handleBoundsChange}
              onPositionChange={handlePositionChange}
              onReady={handleMapReady}
              onPinClick={handleSelectCourse}
              onGroupSelect={handleGroupSelect}
            />

            {/* Mobile bottom sheet */}
            <div
              className="lg:hidden fixed bottom-0 inset-x-0 z-[600] bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden transition-[height] duration-300 ease-in-out"
              style={{
                height: sheetExpanded ? "60dvh" : "calc(76px + env(safe-area-inset-bottom))",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
            >
              {/* Handle row */}
              <div className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
                <button
                  onClick={() => setSheetExpanded((e) => !e)}
                  className="flex items-center gap-2.5 flex-1 min-w-0"
                  aria-label={sheetExpanded ? "Liste schliessen" : "Liste öffnen"}
                >
                  <div className="w-8 h-1 rounded-full bg-gray-300 shrink-0" />
                  <span className="text-sm font-semibold text-gray-700 truncate">
                    {loading
                      ? "Laden…"
                      : `${courses.length} Kurs${courses.length !== 1 ? "e" : ""}`}
                  </span>
                </button>
                <button
                  onClick={() => setShowFilter(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
                  aria-label="Filter öffnen"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
                    />
                  </svg>
                  Filter
                  {activeFilterCount > 0 && (
                    <span
                      className="text-white text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none"
                      style={{ background: "var(--brand-teal)" }}
                    >
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>

              {/* List content — only rendered when expanded */}
              {sheetExpanded && (
                <div className="flex-1 min-h-0 flex flex-col border-t border-gray-100 overflow-hidden">
                  {listContent}
                </div>
              )}
            </div>
          </div>

          {/* Desktop course list panel */}
          <div className="hidden lg:flex lg:flex-[3] border-t border-gray-200 bg-white min-h-0 flex-col">
            {listContent}
          </div>
        </main>
      </div>

      {/* Mobile filter overlay — fixed at root level so it clears Leaflet's stacking context */}
      {showFilter && (
        <div className="lg:hidden fixed inset-0 bg-white z-[2000] flex flex-col overflow-hidden">
          {/* Header with close button */}
          <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold" style={{ color: "var(--brand-dark)" }}>
              Filter
            </span>
            <button
              onClick={() => setShowFilter(false)}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors text-gray-500"
              aria-label="Filter schliessen"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          {/* Wizard entry point */}
          <button
            onClick={() => {
              setShowFilter(false);
              openWizard();
            }}
            className="shrink-0 mx-4 mt-4 mb-1 flex items-center gap-3 p-3 rounded-xl border text-left transition-colors hover:bg-[#EAF4F1]"
            style={{ borderColor: "var(--brand-teal)" }}
          >
            <svg
              className="w-5 h-5 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: "var(--brand-teal)" }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
              />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--brand-teal)" }}>
                Suche neu starten
              </p>
              <p className="text-xs text-gray-400 truncate">Kurstyp, Ferien & Jahrgang wählen</p>
            </div>
            <svg
              className="w-4 h-4 shrink-0 ml-auto text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
          {filterPanel}
          <div
            className="shrink-0 px-4 py-3 border-t border-gray-100 bg-white"
            style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
          >
            <button
              onClick={() => setShowFilter(false)}
              className="w-full text-white text-sm font-semibold rounded-xl py-3 shadow-sm transition-colors"
              style={{ background: "var(--brand-teal)" }}
            >
              {courses.length} Kurs{courses.length !== 1 ? "e" : ""} anzeigen →
            </button>
          </div>
        </div>
      )}

      {/* Mobile map attribution — fixed above the bottom sheet, below all overlays */}
      <div
        className="lg:hidden fixed right-0 z-[550] bg-white/80 text-[10px] text-gray-500 px-1.5 py-0.5 leading-none"
        style={{ bottom: "calc(76px + env(safe-area-inset-bottom))" }}
      >
        <a
          href="https://leafletjs.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          🇺🇦 Leaflet
        </a>
        {" | "}
        <a
          href="https://www.swisstopo.admin.ch"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          © swisstopo
        </a>
      </div>

      {/* Onboarding wizard */}
      {showWizard && (
        <WizardModal
          lookups={lookups}
          initialValues={filters}
          onComplete={handleWizardComplete}
          onSkip={closeWizard}
        />
      )}
    </div>
  );
}
