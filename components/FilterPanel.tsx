"use client";

import { useState } from "react";
import type { Filters } from "@/types";
import { KATEGORIE_COLORS } from "@/types";
import type { LookupOption } from "@/lib/sportPortal";

interface Lookups {
  aktivitaet: LookupOption[];
  ferientyp: LookupOption[];
  ferienwoche: LookupOption[];
  schulkreis: LookupOption[];
  kategorie: LookupOption[];
  jahrgangferien: LookupOption[];
  geschlecht: LookupOption[];
}

interface Props {
  lookups: Lookups;
  filters: Filters;
  filterByBounds: boolean;
  onChange: (filters: Filters) => void;
  onBoundsToggle: (v: boolean) => void;
}

// ── Collapsible section ──────────────────────────────────────────────────────

function Section({
  label,
  count,
  defaultOpen = false,
  children,
}: {
  label: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        <span className="flex items-center gap-1.5">
          {count !== undefined && count > 0 && (
            <span className="bg-blue-600 text-white text-xs font-medium rounded-full px-1.5 py-0.5 leading-none">
              {count}
            </span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {open && <div className="pb-2.5">{children}</div>}
    </div>
  );
}

// ── Checkbox list ────────────────────────────────────────────────────────────

function CheckGroup({
  options,
  selected,
  onToggle,
  colorMap,
  useValue = false,
}: {
  options: LookupOption[];
  selected: number[];
  onToggle: (key: number) => void;
  colorMap?: Record<number, string>;
  useValue?: boolean;
}) {
  return (
    <div className="px-3 space-y-1.5 pt-1">
      {options.map((opt) => {
        const id = useValue ? Number(opt.value) : Number(opt.key);
        const active = selected.includes(id);
        const color = colorMap?.[id];
        return (
          <label key={opt.key} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
              checked={active}
              onChange={() => onToggle(id)}
            />
            {color && (
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            <span className="text-sm text-gray-700 group-hover:text-gray-900">
              {String(opt.value)}
            </span>
          </label>
        );
      })}
    </div>
  );
}

// ── Active filter chips ──────────────────────────────────────────────────────

interface Chip {
  label: string;
  onRemove: () => void;
  color?: string;
}

function ActiveChips({ chips }: { chips: Chip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="px-3 py-2.5 flex flex-wrap gap-1.5 border-b border-gray-100">
      {chips.map((chip, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-800 border border-blue-200 rounded-full pl-2 pr-1 py-0.5"
        >
          {chip.color && (
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: chip.color }}
            />
          )}
          {chip.label}
          <button
            onClick={chip.onRemove}
            className="ml-0.5 text-blue-400 hover:text-blue-700 leading-none"
            aria-label={`${chip.label} entfernen`}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function FilterPanel({
  lookups,
  filters,
  filterByBounds,
  onChange,
  onBoundsToggle,
}: Props) {
  const [aktivitaetSearch, setAktivitaetSearch] = useState("");

  function toggle(
    field: keyof Pick<
      Filters,
      "ferientyp" | "ferienwochen" | "aktivitaeten" | "schulkreis" | "kategorien" | "jahrgaenge"
    >,
    key: number
  ) {
    const current = filters[field] as number[];
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    onChange({ ...filters, [field]: next });
  }

  function resetAll() {
    onChange({
      kurstyp: 2,
      ferientyp: [],
      ferienwochen: [],
      aktivitaeten: [],
      schulkreis: [],
      kategorien: [],
      jahrgaenge: [],
      geschlecht: null,
      check1: false,
    });
    onBoundsToggle(false);
  }

  // Build active chips for the summary row
  function labelFor(list: LookupOption[], key: number) {
    return String(list.find((o) => Number(o.key) === key)?.value ?? key);
  }

  const chips: Chip[] = [
    ...(filterByBounds
      ? [{ label: "Kartenausschnitt", onRemove: () => onBoundsToggle(false) }]
      : []),
    ...(filters.check1
      ? [{ label: "Nur freie Plätze", onRemove: () => onChange({ ...filters, check1: false }) }]
      : []),
    ...(filters.kurstyp === 1
      ? [{ label: "Semesterkurse", onRemove: () => onChange({ ...filters, kurstyp: 2 }) }]
      : []),
    ...filters.ferientyp.map((k) => ({
      label: labelFor(lookups.ferientyp, k),
      onRemove: () => toggle("ferientyp", k),
    })),
    ...filters.ferienwochen.map((k) => ({
      label: labelFor(lookups.ferienwoche, k),
      onRemove: () => toggle("ferienwochen", k),
    })),
    ...filters.kategorien.map((k) => ({
      label: labelFor(lookups.kategorie, k),
      color: KATEGORIE_COLORS[k],
      onRemove: () => toggle("kategorien", k),
    })),
    ...(filters.geschlecht !== null
      ? [
          {
            label: labelFor(lookups.geschlecht, filters.geschlecht),
            onRemove: () => onChange({ ...filters, geschlecht: null }),
          },
        ]
      : []),
    ...filters.schulkreis.map((k) => ({
      label: labelFor(lookups.schulkreis, k),
      onRemove: () => toggle("schulkreis", k),
    })),
    ...filters.aktivitaeten.map((k) => ({
      label: labelFor(lookups.aktivitaet, k),
      onRemove: () => toggle("aktivitaeten", k),
    })),
    ...filters.jahrgaenge.map((year) => ({
      label: `Jg. ${year}`,
      onRemove: () => toggle("jahrgaenge", year),
    })),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Filter panel header */}
      <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-gray-400">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"
            />
          </svg>
          Filter
        </span>
        {chips.length > 0 && (
          <button
            onClick={resetAll}
            className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {/* Active filter chips — always visible */}
      {chips.length > 0 ? (
        <ActiveChips chips={chips} />
      ) : (
        <div className="px-3 py-2.5 text-xs text-gray-400 border-b border-gray-100 italic">
          Keine Filter aktiv
        </div>
      )}

      {/* Scrollable filter sections */}
      <div className="overflow-y-auto flex-1">
        {/* Quick toggles — always visible, no collapse needed */}
        <div className="px-3 py-2.5 flex flex-wrap gap-x-4 gap-y-2 border-b border-gray-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={filterByBounds}
              onChange={(e) => onBoundsToggle(e.target.checked)}
            />
            <span className="text-sm text-gray-700">Kartenausschnitt</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={filters.check1}
              onChange={(e) => onChange({ ...filters, check1: e.target.checked })}
            />
            <span className="text-sm text-gray-700">Nur freie Plätze</span>
          </label>
        </div>

        {/* Kurstyp */}
        <Section label="Kurstyp" defaultOpen>
          <div className="px-3 pt-1 flex gap-4">
            {[
              { id: 2, label: "Ferienkurse" },
              { id: 1, label: "Semesterkurse" },
            ].map(({ id, label }) => (
              <label key={id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="kurstyp"
                  className="text-blue-600 focus:ring-blue-500"
                  checked={filters.kurstyp === id}
                  onChange={() => onChange({ ...filters, kurstyp: id })}
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section
          label="Ferientyp"
          count={filters.ferientyp.length}
          defaultOpen={filters.ferientyp.length > 0}
        >
          <CheckGroup
            options={lookups.ferientyp}
            selected={filters.ferientyp}
            onToggle={(k) => toggle("ferientyp", k)}
          />
        </Section>

        <Section
          label="Ferienwoche"
          count={filters.ferienwochen.length}
          defaultOpen={filters.ferienwochen.length > 0}
        >
          <CheckGroup
            options={lookups.ferienwoche}
            selected={filters.ferienwochen}
            onToggle={(k) => toggle("ferienwochen", k)}
          />
        </Section>

        <Section
          label="Jahrgang"
          count={filters.jahrgaenge.length}
          defaultOpen={filters.jahrgaenge.length > 0}
        >
          <CheckGroup
            options={lookups.jahrgangferien}
            selected={filters.jahrgaenge}
            onToggle={(k) => toggle("jahrgaenge", k)}
            useValue
          />
        </Section>

        <Section
          label="Geschlecht"
          count={filters.geschlecht !== null ? 1 : 0}
          defaultOpen={filters.geschlecht !== null}
        >
          <div className="px-3 pt-1 space-y-1.5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="geschlecht"
                className="text-blue-600 focus:ring-blue-500"
                checked={filters.geschlecht === null}
                onChange={() => onChange({ ...filters, geschlecht: null })}
              />
              <span className="text-sm text-gray-700">Alle</span>
            </label>
            {lookups.geschlecht.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="geschlecht"
                  className="text-blue-600 focus:ring-blue-500"
                  checked={filters.geschlecht === Number(opt.key)}
                  onChange={() => onChange({ ...filters, geschlecht: Number(opt.key) })}
                />
                <span className="text-sm text-gray-700">{String(opt.value)}</span>
              </label>
            ))}
          </div>
        </Section>

        <Section
          label="Schulkreis"
          count={filters.schulkreis.length}
          defaultOpen={filters.schulkreis.length > 0}
        >
          <CheckGroup
            options={lookups.schulkreis}
            selected={filters.schulkreis}
            onToggle={(k) => toggle("schulkreis", k)}
          />
        </Section>

        <Section
          label="Kategorie"
          count={filters.kategorien.length}
          defaultOpen={filters.kategorien.length > 0}
        >
          <CheckGroup
            options={lookups.kategorie}
            selected={filters.kategorien}
            onToggle={(k) => toggle("kategorien", k)}
            colorMap={KATEGORIE_COLORS}
          />
        </Section>

        <Section
          label="Aktivität"
          count={filters.aktivitaeten.length}
          defaultOpen={filters.aktivitaeten.length > 0}
        >
          <div className="px-3 pt-1 pb-1">
            <input
              type="text"
              placeholder="Suchen…"
              value={aktivitaetSearch}
              onChange={(e) => setAktivitaetSearch(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <CheckGroup
            options={lookups.aktivitaet.filter((o) =>
              String(o.value).toLowerCase().includes(aktivitaetSearch.toLowerCase())
            )}
            selected={filters.aktivitaeten}
            onToggle={(k) => toggle("aktivitaeten", k)}
          />
        </Section>
      </div>

      {/* Disclaimer */}
      <div className="px-3 py-2 border-t border-gray-100 shrink-0">
        <p className="text-xs text-gray-400">
          Unabhängiges Community-Tool. Kursdaten stammen von{" "}
          <a
            href="https://www.stadt-zuerich.ch/sport-portal"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600"
          >
            stadt-zuerich.ch
          </a>
          .
        </p>
      </div>
    </div>
  );
}
