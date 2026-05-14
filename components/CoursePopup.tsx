"use client";

import { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import type { EnrichedCourse } from "@/types";

interface Props {
  course: EnrichedCourse;
}

function formatDate(iso: string): string {
  if (!iso || iso.startsWith("0001")) return "";
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function sanitizeText(text: string): string {
  // The Sport Portal API embeds \r\n inside href values, breaking URLs — strip whitespace from them
  const normalized = text.replace(
    /href="([^"]*)"/g,
    (_, url) => `href="${url.replace(/\s+/g, "")}"`
  );
  const clean = DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS: ["p", "br", "strong", "b", "a"],
    ALLOWED_ATTR: ["href", "target"],
  });
  // Force safe link attributes and visible styling
  return clean.replace(
    /<a /g,
    '<a target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;" '
  );
}

export default function CoursePopup({ course }: Props) {
  const [descExpanded, setDescExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (el) setIsClamped(el.scrollHeight > el.clientHeight);
  }, [course.text, descExpanded]);

  const portalUrl = `https://www.stadt-zuerich.ch/sport-portal/angebot/${course.angebotId}/${course.titelUrl}`;
  const dates = [
    formatDate(course.von),
    course.bis && course.bis !== course.von ? formatDate(course.bis) : "",
  ]
    .filter(Boolean)
    .join(" – ");
  const anmeldeschluss = formatDate(course.anmeldeschluss);

  return (
    <div className="max-w-xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-400 mb-0.5 font-mono">{course.nummer}</div>
          <h2 className="text-lg font-bold leading-snug" style={{ color: "var(--brand-dark)" }}>
            {course.titel}
          </h2>
        </div>
        <img
          src={`/api/image/${course.angebotId}`}
          alt={course.titel}
          className="h-16 w-16 object-contain rounded shrink-0"
          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
        />
      </div>

      {/* Schedule */}
      {(course.zeitpunkt1 || course.zeitpunkt2 || course.zeitpunkt3) && (
        <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-4 text-sm text-gray-700 space-y-0.5 border border-gray-100">
          {course.zeitpunkt1 && <div>{course.zeitpunkt1}</div>}
          {course.zeitpunkt2 && <div>{course.zeitpunkt2}</div>}
          {course.zeitpunkt3 && <div>{course.zeitpunkt3}</div>}
        </div>
      )}

      {/* Metadata */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4 text-sm">
        {course.kursOrt && (
          <>
            <dt className="text-gray-400 text-xs uppercase tracking-wide self-center">Ort</dt>
            <dd className="font-medium text-gray-800">{course.kursOrt}</dd>
          </>
        )}
        {dates && (
          <>
            <dt className="text-gray-400 text-xs uppercase tracking-wide self-center">Daten</dt>
            <dd className="font-medium text-gray-800">{dates}</dd>
          </>
        )}
        {course.jahrgang && (
          <>
            <dt className="text-gray-400 text-xs uppercase tracking-wide self-center">Jahrgang</dt>
            <dd className="font-medium text-gray-800">{course.jahrgang}</dd>
          </>
        )}
        {anmeldeschluss && (
          <>
            <dt className="text-gray-400 text-xs uppercase tracking-wide self-center">Anmeldung</dt>
            <dd className="font-medium text-gray-800">{anmeldeschluss}</dd>
          </>
        )}
        {course.geschlecht && (
          <>
            <dt className="text-gray-400 text-xs uppercase tracking-wide self-center">
              Geschlecht
            </dt>
            <dd className="font-medium text-gray-800">{course.geschlecht}</dd>
          </>
        )}
        {course.niveau && (
          <>
            <dt className="text-gray-400 text-xs uppercase tracking-wide self-center">Niveau</dt>
            <dd className="font-medium text-gray-800">{course.niveau}</dd>
          </>
        )}
      </dl>

      {/* Status badges — derive from always-present fields; status object only exists for seeded data */}
      {(() => {
        const aufWarteliste =
          course.status?.aufWarteliste ?? course.status2?.toLowerCase().includes("warteliste");
        const ausgebucht = course.status?.ausgebucht ?? (!course.hatFreiePlaetze && !aufWarteliste);
        const bedingteAnmeldung = course.status?.bedingteAnmeldung ?? false;
        return (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {course.hatFreiePlaetze ? (
              <span className="bg-green-100 text-green-800 text-xs px-2.5 py-1 rounded-full font-medium">
                Freie Plätze
              </span>
            ) : ausgebucht ? (
              <span className="bg-red-100 text-red-800 text-xs px-2.5 py-1 rounded-full font-medium">
                Ausgebucht
              </span>
            ) : null}
            {aufWarteliste && (
              <span className="bg-orange-100 text-orange-800 text-xs px-2.5 py-1 rounded-full font-medium">
                Warteliste
              </span>
            )}
            {bedingteAnmeldung && (
              <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-1 rounded-full font-medium">
                Bedingte Anmeldung
              </span>
            )}
            {course.hasBuchungscode && (
              <span className="bg-purple-100 text-purple-800 text-xs px-2.5 py-1 rounded-full font-medium">
                Buchungscode erforderlich
              </span>
            )}
            {course.approximate && (
              <span className="bg-yellow-100 text-yellow-800 text-xs px-2.5 py-1 rounded-full font-medium">
                Standort ungefähr
              </span>
            )}
          </div>
        );
      })()}

      {course.status1 && <p className="text-xs text-gray-500 mb-4">{course.status1}</p>}

      {/* Description */}
      {course.text && (
        <div className="mb-5 text-sm text-gray-700 leading-relaxed border-t border-gray-100 pt-4">
          <div
            ref={textRef}
            className={descExpanded ? "" : "line-clamp-4"}
            dangerouslySetInnerHTML={{ __html: sanitizeText(course.text) }}
          />
          {(isClamped || descExpanded) && (
            <button
              onClick={() => setDescExpanded((v) => !v)}
              className="mt-1.5 text-xs font-medium hover:underline"
              style={{ color: "var(--brand-teal)" }}
            >
              {descExpanded ? "Weniger anzeigen" : "Mehr anzeigen"}
            </button>
          )}
        </div>
      )}

      {/* CTA */}
      <a
        href={portalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--brand-teal)" }}
      >
        Zum offiziellen Portal →
      </a>
    </div>
  );
}
