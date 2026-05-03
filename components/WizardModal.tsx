"use client";

import { useState } from "react";
import type { Filters } from "@/types";
import type { LookupOption } from "@/lib/sportPortal";

interface Lookups {
  ferientyp: LookupOption[];
  ferienwoche: LookupOption[];
  jahrgangferien: LookupOption[];
}

interface Props {
  lookups: Lookups | null;
  initialValues: Partial<Filters>;
  onComplete: (filters: Partial<Filters>) => void;
  onSkip: () => void;
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        selected
          ? "text-white border-transparent"
          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
      }`}
      style={selected ? { background: "var(--brand-teal)", borderColor: "var(--brand-teal)" } : {}}
    >
      {label}
    </button>
  );
}

// Max weeks per ferientyp key (based on Zürich school holiday schedule)
const FERIENTYP_MAX_WEEKS: Record<number, number> = {
  1: 2, // Frühlingsferien
  2: 5, // Sommerferien
  3: 2, // Herbstferien
  4: 2, // Sportferien
  5: 2, // SPAZ
  6: 2, // Ferienplausch
  7: 1, // Intensivkurs WSC
  8: 2, // Onlinekurs Sportferien
};

function availableWeekKeys(selectedFerientypen: number[], allWeeks: LookupOption[]): Set<number> {
  if (selectedFerientypen.length === 0) return new Set(allWeeks.map((w) => Number(w.key)));
  const maxWeek = Math.max(...selectedFerientypen.map((k) => FERIENTYP_MAX_WEEKS[k] ?? 5));
  return new Set(allWeeks.filter((w) => Number(w.key) <= maxWeek).map((w) => Number(w.key)));
}

export default function WizardModal({ lookups, initialValues, onComplete, onSkip }: Props) {
  const [step, setStep] = useState(1);
  const [kurstyp, setKurstyp] = useState<1 | 2>(initialValues.kurstyp === 1 ? 1 : 2);
  const [ferientyp, setFerientyp] = useState<number[]>(initialValues.ferientyp ?? []);
  const [ferienwochen, setFerienwochen] = useState<number[]>(initialValues.ferienwochen ?? []);
  const [jahrgaenge, setJahrgaenge] = useState<number[]>(initialValues.jahrgaenge ?? []);

  // Ferienkurse: 4 steps (kurstyp → ferientyp → ferienwoche → jahrgang)
  // Semesterkurse: 2 steps (kurstyp → jahrgang)
  const totalSteps = kurstyp === 2 ? 4 : 2;
  const displayStep = kurstyp === 1 && step === 4 ? 2 : step;
  const isLastStep = step === 4;
  const availableWeeks = availableWeekKeys(ferientyp, lookups?.ferienwoche ?? []);

  function toggleFerientyp(key: number) {
    const next = ferientyp.includes(key) ? ferientyp.filter((k) => k !== key) : [...ferientyp, key];
    setFerientyp(next);
    const valid = availableWeekKeys(next, lookups?.ferienwoche ?? []);
    setFerienwochen((w) => w.filter((wk) => valid.has(wk)));
  }

  function toggleFerienwoche(key: number) {
    setFerienwochen((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleJahrgang(val: number) {
    setJahrgaenge((prev) => (prev.includes(val) ? prev.filter((k) => k !== val) : [...prev, val]));
  }

  function handleNext() {
    if (step === 1) {
      setStep(kurstyp === 2 ? 2 : 4);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else {
      const result: Partial<Filters> = {
        kurstyp,
        ...(kurstyp === 2 && ferientyp.length > 0 ? { ferientyp } : {}),
        ...(kurstyp === 2 && ferienwochen.length > 0 ? { ferienwochen } : {}),
        ...(jahrgaenge.length > 0 ? { jahrgaenge } : {}),
      };
      onComplete(result);
    }
  }

  function handleBack() {
    if (step === 4) {
      setStep(kurstyp === 2 ? 3 : 1);
    } else if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setStep(1);
    }
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <button className="absolute inset-0 bg-black/40" onClick={onSkip} aria-label="Überspringen" />

      {/* Modal card */}
      <div
        className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col gap-5 p-6"
        style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom))" }}
      >
        {/* Progress + back + skip */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={handleBack}
            aria-label="Zurück"
            className={`text-gray-400 hover:text-gray-600 transition-colors ${step === 1 ? "invisible pointer-events-none" : ""}`}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M12.5 15L7.5 10L12.5 5"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex gap-1.5">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className="h-1.5 w-7 rounded-full transition-colors"
                style={{
                  background: i < displayStep ? "var(--brand-teal)" : "#e5e7eb",
                }}
              />
            ))}
          </div>
          <button
            onClick={onSkip}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Überspringen
          </button>
        </div>

        {/* Step 1 — Kurstyp */}
        {step === 1 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: "var(--brand-dark)" }}>
                Was suchst du?
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Welche Art von Kurs interessiert dich?</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  { value: 2, emoji: "🌞", label: "Ferienkurse", sub: "In den Schulferien" },
                  { value: 1, emoji: "📚", label: "Semesterkurse", sub: "Übers Semester" },
                ] as const
              ).map(({ value, emoji, label, sub }) => (
                <button
                  key={value}
                  onClick={() => setKurstyp(value)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    kurstyp === value
                      ? "bg-[#EAF4F1]"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                  style={
                    kurstyp === value
                      ? { borderColor: "var(--brand-teal)", color: "var(--brand-dark)" }
                      : {}
                  }
                >
                  <span className="text-3xl">{emoji}</span>
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-[11px] text-gray-400 text-center">{sub}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step 2 — Ferientyp (Ferienkurse only) */}
        {step === 2 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: "var(--brand-dark)" }}>
                Welche Ferien?
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Mehrere möglich</p>
            </div>
            {lookups ? (
              <div className="flex flex-wrap gap-2">
                {lookups.ferientyp.map((opt) => (
                  <Chip
                    key={opt.key}
                    label={String(opt.value)}
                    selected={ferientyp.includes(Number(opt.key))}
                    onClick={() => toggleFerientyp(Number(opt.key))}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-9 w-28 bg-gray-100 rounded-full animate-pulse" />
                ))}
              </div>
            )}
          </>
        )}

        {/* Step 3 — Ferienwoche (Ferienkurse only) */}
        {step === 3 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: "var(--brand-dark)" }}>
                Welche Ferienwoche?
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Mehrere möglich</p>
            </div>
            {lookups ? (
              <div className="flex flex-wrap gap-2">
                {lookups.ferienwoche
                  .filter((opt) => availableWeeks.has(Number(opt.key)))
                  .map((opt) => (
                    <Chip
                      key={opt.key}
                      label={String(opt.value)}
                      selected={ferienwochen.includes(Number(opt.key))}
                      onClick={() => toggleFerienwoche(Number(opt.key))}
                    />
                  ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-9 w-20 bg-gray-100 rounded-full animate-pulse" />
                ))}
              </div>
            )}
          </>
        )}

        {/* Step 4 — Jahrgang */}
        {step === 4 && (
          <>
            <div>
              <h2 className="text-xl font-bold" style={{ color: "var(--brand-dark)" }}>
                Jahrgang des Kindes?
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Mehrere möglich</p>
            </div>
            {lookups ? (
              <div className="flex flex-wrap gap-2">
                {lookups.jahrgangferien.map((opt) => {
                  const val = Number(opt.value);
                  return (
                    <Chip
                      key={opt.key}
                      label={String(opt.value)}
                      selected={jahrgaenge.includes(val)}
                      onClick={() => toggleJahrgang(val)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-9 w-16 bg-gray-100 rounded-full animate-pulse" />
                ))}
              </div>
            )}
          </>
        )}

        {/* CTA */}
        <button
          onClick={handleNext}
          className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-opacity hover:opacity-90"
          style={{ background: "var(--brand-teal)" }}
        >
          {isLastStep ? "Kurse entdecken →" : "Weiter →"}
        </button>
      </div>
    </div>
  );
}
