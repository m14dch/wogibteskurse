import { NextRequest, NextResponse } from "next/server";
import { fetchAllCourses, SportPortalError } from "@/lib/sportPortal";
import { geocodeVenues } from "@/lib/geocoder";
import db from "@/lib/db";
import { API_LIMITS, getClientIp, rateLimit } from "@/lib/apiProtection";

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const ARRAY_LIMITS = {
  ferientyp: 10,
  ferienwochen: 10,
  aktivitaeten: 100,
  schulkreis: 20,
  kategorien: 10,
  jahrgaenge: 30,
} as const;

function isNumberArray(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 0 && isFinite(x))
  );
}

function isBounds(v: unknown): v is Bounds {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.north === "number" &&
    typeof b.south === "number" &&
    typeof b.east === "number" &&
    typeof b.west === "number" &&
    isFinite(b.north) &&
    isFinite(b.south) &&
    isFinite(b.east) &&
    isFinite(b.west)
  );
}

function validate(body: unknown): string | null {
  if (!body || typeof body !== "object") return "Request body must be a JSON object";
  const b = body as Record<string, unknown>;
  if (b.kurstyp !== 1 && b.kurstyp !== 2) return "kurstyp must be 1 or 2";
  for (const [field, maxLength] of Object.entries(ARRAY_LIMITS)) {
    const value = b[field];
    if (!isNumberArray(value)) return `${field} must be an array of non-negative integer IDs`;
    if (value.length > maxLength) return `${field} must contain at most ${maxLength} values`;
  }
  if (
    b.geschlecht !== null &&
    (typeof b.geschlecht !== "number" ||
      !Number.isInteger(b.geschlecht) ||
      b.geschlecht < 0 ||
      !isFinite(b.geschlecht))
  ) {
    return "geschlecht must be a non-negative integer or null";
  }
  if (typeof b.check1 !== "boolean") return "check1 must be a boolean";
  if (b.bounds !== undefined) {
    if (!isBounds(b.bounds)) return "bounds must have numeric north/south/east/west";
    if (b.bounds.north <= b.bounds.south) return "bounds north must be greater than south";
    if (b.bounds.east <= b.bounds.west) return "bounds east must be greater than west";
    if (
      b.bounds.north > 90 ||
      b.bounds.south < -90 ||
      b.bounds.east > 180 ||
      b.bounds.west < -180
    ) {
      return "bounds must be valid latitude/longitude values";
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(`courses:${getClientIp(req)}`, {
    limit: API_LIMITS.coursesPerMinute(),
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es gleich nochmals." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > API_LIMITS.maxBodyBytes()) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const { bounds, ...filters } = body as { bounds?: Bounds } & Parameters<
      typeof fetchAllCourses
    >[0];

    const courses = await fetchAllCourses(filters);

    // Cache images in SQLite and strip bild from the response payload
    const upsertImage = db.prepare(
      "INSERT OR REPLACE INTO images (angebotId, bild, fetched_at) VALUES (?, ?, unixepoch())"
    );
    const upsertAll = db.transaction(() => {
      for (const c of courses) {
        if (c.bild) upsertImage.run(c.angebotId, c.bild);
      }
    });
    upsertAll();

    // In the seeded cache path this is intentionally empty; it only activates for upstream fallback
    // courses that were not enriched from the city detail cache.
    const uniqueVenues = [
      ...new Set(
        courses
          .filter((c) => typeof c.lat !== "number" || typeof c.lng !== "number")
          .map((c) => c.kursOrt)
          .filter(Boolean)
      ),
    ];
    const coords = await geocodeVenues(uniqueVenues);

    // Attach coordinates and apply bounds filter; omit bild from JSON response
    const enriched = courses
      .map((course) => {
        const venue = coords.get(course.kursOrt);
        // Pre-baked coords (seeded LV95 or overrides) take precedence; fall back to geocoder.
        const hasPrebakedCoords = typeof course.lat === "number" && typeof course.lng === "number";
        const lat = hasPrebakedCoords ? course.lat : (venue?.lat ?? null);
        const lng = hasPrebakedCoords ? course.lng : (venue?.lng ?? null);
        // When coords come from geocoder (not pre-baked), use geocoder's approximate flag so
        // that a precise swisstopo hit isn't overridden by a stale approximate=true in the DB.
        const approximate = hasPrebakedCoords
          ? (course.approximate ?? false)
          : (venue?.approximate ?? false);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { bild: _bild, ...rest } = course;
        return {
          ...rest,
          lat,
          lng,
          approximate,
        };
      })
      .filter((course) => {
        if (!bounds || typeof course.lat !== "number" || typeof course.lng !== "number")
          return true;
        return (
          course.lat <= bounds.north &&
          course.lat >= bounds.south &&
          course.lng <= bounds.east &&
          course.lng >= bounds.west
        );
      });

    return NextResponse.json({ total: enriched.length, results: enriched });
  } catch (err) {
    if (err instanceof SportPortalError) {
      const status = err.retryable ? 503 : 502;
      return NextResponse.json({ error: err.publicMessage }, { status });
    }
    console.error("Unexpected courses API failure", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Die Kurse konnten nicht geladen werden. Bitte versuche es später nochmals." },
      { status: 502 }
    );
  }
}
