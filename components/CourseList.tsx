"use client";

import type { EnrichedCourse } from "@/types";
import { KATEGORIE_COLORS, DEFAULT_COLOR } from "@/types";

interface Props {
  courses: EnrichedCourse[];
  selectedId: number | null;
  onSelect: (course: EnrichedCourse) => void;
}

function formatDateShort(iso: string): string {
  if (!iso || iso.startsWith("0001")) return "";
  return new Date(iso).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit" });
}

export default function CourseList({ courses, selectedId, onSelect }: Props) {
  if (courses.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Keine Kurse gefunden
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100 overflow-y-auto h-full">
      {courses.map((course) => {
        const color = KATEGORIE_COLORS[course.kategorieId] ?? DEFAULT_COLOR;
        const isSelected = course.angebotId === selectedId;
        const hasCoords = course.lat !== null && course.lng !== null;

        return (
          <button
            key={course.angebotId}
            onClick={() => onSelect(course)}
            className={`w-full text-left px-3 py-3 flex gap-2.5 items-start transition-colors border-l-2 ${
              isSelected ? "bg-blue-50 border-blue-500" : "border-transparent hover:bg-gray-50"
            } ${!hasCoords && !isSelected ? "opacity-50" : ""}`}
          >
            {/* Category dot */}
            <span
              className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-1">
                <span className="text-sm font-medium text-gray-800 leading-snug line-clamp-1">
                  {course.titel}
                </span>
                <span className="text-xs text-gray-400 shrink-0 mt-0.5">{course.nummer}</span>
              </div>

              <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0">
                <span>{course.kursOrt}</span>
                <span>·</span>
                <span>{course.zeitpunkt1.replace(/,.*/, "")}</span>
                {course.von && (
                  <>
                    <span>·</span>
                    <span>{formatDateShort(course.von)}</span>
                  </>
                )}
              </div>

              <div className="text-xs text-gray-400 mt-0.5">Jg. {course.jahrgang}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                {!course.hatFreiePlaetze && (
                  <span className="inline-flex items-center bg-red-100 text-red-700 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none">
                    ausgebucht
                  </span>
                )}
                {course.hatFreiePlaetze && (
                  <span className="inline-flex items-center bg-green-100 text-green-700 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none">
                    frei
                  </span>
                )}
                {course.approximate && (
                  <span className="inline-flex items-center text-yellow-600 text-[10px]">
                    ~ Standort
                  </span>
                )}
                {!hasCoords && (
                  <span className="inline-flex items-center text-gray-300 text-[10px]">
                    kein Standort
                  </span>
                )}
              </div>
            </div>

            {hasCoords && (
              <span className="mt-1 text-gray-300 shrink-0" title="Auf Karte zeigen">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
