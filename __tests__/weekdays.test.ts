import { describe, it, expect } from "vitest";
import { courseWeekdayIds } from "@/lib/sportPortal";
import type { Course } from "@/lib/sportPortal";

// Minimal course skeleton — only zeitpunkt/von/bis matter for day parsing
function course(zeitpunkt1: string, zeitpunkt2 = "", zeitpunkt3 = "", von = "", bis = ""): Course {
  return {
    angebotId: 1,
    nummer: "",
    titel: "",
    titelUrl: "",
    text: "",
    kurstypId: 2,
    aktivitaetId: 1,
    ferientypId: 1,
    ferienwocheId: 1,
    schulkreisId: 1,
    kategorieId: 1,
    geschlechtId: 3,
    jahrgangVon: 2010,
    jahrgangBis: 2015,
    von,
    bis,
    zeitpunkt1,
    zeitpunkt2,
    zeitpunkt3,
    jahrgang: "",
    geschlecht: "",
    niveau: "",
    kursOrt: "",
    hatFreiePlaetze: true,
    hasBuchungscode: false,
    status: {
      angebotStatusId: 0,
      buchbar: true,
      aufWarteliste: false,
      ausgebucht: false,
      bedingteAnmeldung: false,
    },
    status1: "",
    anmeldeschluss: "",
  };
}

describe("courseWeekdayIds", () => {
  describe("single-day zeitpunkt", () => {
    it("extracts a bare day name", () => {
      expect(courseWeekdayIds(course("Montag"))).toEqual([1]);
      expect(courseWeekdayIds(course("Freitag"))).toEqual([5]);
      expect(courseWeekdayIds(course("Sonntag"))).toEqual([7]);
    });

    it("extracts a day name followed by comma and time", () => {
      expect(courseWeekdayIds(course("Montag, 14:00–15:30 Uhr"))).toEqual([1]);
      expect(courseWeekdayIds(course("Samstag, 09:00 Uhr"))).toEqual([6]);
    });
  });

  describe("day-range zeitpunkt (Montag bis Freitag pattern)", () => {
    it("expands a Mon–Fri range to IDs 1–5", () => {
      expect(courseWeekdayIds(course("Sommerferien 2026, 1. Woche", "Montag bis Freitag"))).toEqual(
        [1, 2, 3, 4, 5]
      );
    });

    it("expands a Mon–Thu range to IDs 1–4", () => {
      expect(courseWeekdayIds(course("Montag bis Donnerstag"))).toEqual([1, 2, 3, 4]);
    });

    it("expands a Sat–Sun range to IDs 6–7", () => {
      expect(courseWeekdayIds(course("Samstag bis Sonntag"))).toEqual([6, 7]);
    });

    it("handles a single-day range (identical endpoints)", () => {
      expect(courseWeekdayIds(course("Mittwoch bis Mittwoch"))).toEqual([3]);
    });
  });

  describe("non-day zeitpunkt strings", () => {
    it("ignores time-only and week description strings", () => {
      // All three zeitpunkt fields contain no day name → falls back to von/bis
      const c = course(
        "Sommerferien 2026, 1. Woche",
        "10.00–16.00 Uhr",
        "",
        "2026-07-13",
        "2026-07-17"
      );
      const ids = courseWeekdayIds(c);
      // July 13–17 2026 is Mon–Fri
      expect(ids.sort()).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("date-range fallback", () => {
    it("derives weekdays from von/bis for a Mon–Fri week (no weekend bleed)", () => {
      // July 13–17 2026 is Mon–Fri
      const ids = courseWeekdayIds(course("", "", "", "2026-07-13", "2026-07-17"));
      expect(ids.sort()).toEqual([1, 2, 3, 4, 5]);
    });

    it("includes Saturday and Sunday only when the date span covers them", () => {
      // July 13–19 2026 is Mon–Sun
      const ids = courseWeekdayIds(course("", "", "", "2026-07-13", "2026-07-19"));
      expect(ids.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it("returns empty array when von/bis are missing", () => {
      expect(courseWeekdayIds(course(""))).toEqual([]);
    });
  });

  describe("multiple zeitpunkt fields", () => {
    it("collects days from all three zeitpunkt fields", () => {
      const ids = courseWeekdayIds(course("Montag", "Mittwoch", "Freitag"));
      expect(ids.sort()).toEqual([1, 3, 5]);
    });

    it("a range in one field and a single day in another are both counted", () => {
      const ids = courseWeekdayIds(course("Montag bis Mittwoch", "Freitag"));
      expect(ids.sort()).toEqual([1, 2, 3, 5]);
    });
  });
});
