/* global console, fetch, setTimeout */

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const BASE_URL = "https://www.stadt-zuerich.ch/sport-portal";
const SWISSTOPO_URL = "https://api3.geo.admin.ch/rest/services/api/SearchServer";
const DB_PATH = process.env.SEED_DATABASE_PATH ?? path.join(process.cwd(), ".seed", "geocode.db");
const VENUE_OVERRIDES_PATH = path.join(process.cwd(), "lib", "venue-overrides.json");
const ZURICH_CENTER = { lat: 47.3769, lng: 8.5417 };
const LOOKUP_TYPES = [
  "aktivitaet",
  "ferientyp",
  "ferienwoche",
  "schulkreis",
  "kategorie",
  "jahrgangferien",
  "geschlecht",
];
const COURSE_TYPES = [1, 2];
const PAGE_SIZE = 100;
const DETAIL_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.SEED_DETAIL_CONCURRENCY ?? "8", 10)
);
const SWISSTOPO_RATE_MS = 220;
let swisstopoQueue = Promise.resolve();
let lastSwisstopoAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Identical to lib/lv95.ts lv95ToWgs84 — keep in sync (seed script cannot import TS).
function lv95ToWgs84(easting, northing) {
  const y = (easting - 2600000) / 1000000;
  const x = (northing - 1200000) / 1000000;
  const lat =
    16.9023892 +
    3.238272 * x -
    0.270978 * y * y -
    0.002528 * x * x -
    0.0447 * y * y * x -
    0.014 * x * x * x;
  const lng = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;

  return { lat: (lat * 100) / 36, lng: (lng * 100) / 36 };
}

function hasLv95(detail) {
  return (
    Number.isFinite(detail?.anlageLaengengrad) &&
    Number.isFinite(detail?.anlageBreitengrad) &&
    detail.anlageLaengengrad > 1000000 &&
    detail.anlageBreitengrad > 1000000
  );
}

function loadVenueOverrides() {
  if (!fs.existsSync(VENUE_OVERRIDES_PATH)) return new Map();
  const overrides = JSON.parse(fs.readFileSync(VENUE_OVERRIDES_PATH, "utf8"));
  return new Map(overrides.map((override) => [override.name, override]));
}

function broadSwisstopoResult(attrs) {
  const label = String(attrs?.label ?? "").toLowerCase();
  const detail = String(attrs?.detail ?? "").toLowerCase();
  return /grossregion|mittelland|plateau suisse|kanton|bezirk/.test(`${label} ${detail}`);
}

async function geocodeWithSwisstopo(query) {
  const url = `${SWISSTOPO_URL}?type=locations&searchText=${encodeURIComponent(
    query
  )}&sr=4326&lang=de&limit=1`;
  const json = await fetchSwisstopoJson(url);
  const attrs = json?.results?.[0]?.attrs;
  if (!attrs?.lat || !attrs?.lon || broadSwisstopoResult(attrs)) return null;
  return { lat: attrs.lat, lng: attrs.lon };
}

function fetchSwisstopoJson(url) {
  const next = swisstopoQueue.then(async () => {
    const wait = SWISSTOPO_RATE_MS - (Date.now() - lastSwisstopoAt);
    if (wait > 0) await sleep(wait);
    lastSwisstopoAt = Date.now();
    return fetchJson(url);
  });
  swisstopoQueue = next.catch(() => {});
  return next;
}

async function coordinatesForCourse(course, detail, venueOverrides) {
  if (hasLv95(detail)) {
    return {
      ...lv95ToWgs84(detail.anlageLaengengrad, detail.anlageBreitengrad),
      approximate: false,
      source: "city-detail",
    };
  }

  const override = venueOverrides.get(course.kursOrt) ?? venueOverrides.get(course.kursOrt?.trim());
  if (override) {
    return { lat: override.lat, lng: override.lng, approximate: false, source: "venue-override" };
  }

  const address = [detail?.anlageStrasse, detail?.anlagePlzOrt].filter(Boolean).join(", ");
  for (const query of [address, `${course.kursOrt} Zürich`].filter(Boolean)) {
    const result = await geocodeWithSwisstopo(query);
    if (result) return { ...result, approximate: false, source: "swisstopo-build" };
  }

  return { ...ZURICH_CENTER, approximate: true, source: "fallback-zurich-center" };
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${url} failed with ${res.status}`);
  return res.json();
}

async function getTokens() {
  const res = await fetch(`${BASE_URL}/API/api/accounts/currentuser`);
  if (!res.ok) throw new Error(`Token request failed with ${res.status}`);

  const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
  let xsrfToken = null;
  let requestVerificationToken = null;

  for (const header of setCookieHeaders) {
    const xsrfMatch = header.match(/XSRF-TOKEN=([^;]+)/);
    if (xsrfMatch) xsrfToken = decodeURIComponent(xsrfMatch[1]);

    const rvtMatch = header.match(/__RequestVerificationToken=([^;]+)/);
    if (rvtMatch) requestVerificationToken = decodeURIComponent(rvtMatch[1]);
  }

  if (!xsrfToken || !requestVerificationToken) {
    throw new Error("Could not obtain sport portal tokens");
  }

  return {
    xsrfToken,
    headers: {
      "Content-Type": "application/json",
      "x-xsrf-token": xsrfToken,
      Cookie: `__RequestVerificationToken=${requestVerificationToken}; XSRF-TOKEN=${xsrfToken}`,
    },
  };
}

async function fetchLookups() {
  const entries = await Promise.all(
    LOOKUP_TYPES.map(async (type) => {
      const json = await fetchJson(`${BASE_URL}/API/api/lookups/init/${type}`);
      return [type, json.success ? json.data : []];
    })
  );
  return Object.fromEntries(entries);
}

async function fetchCoursePage(kurstyp, pageNumber, headers) {
  const body = {
    kurstyp,
    aktivitaeten: [],
    ferienwochen: [],
    ferientyp: [],
    wochentage: [],
    jahrgaenge: [],
    geschlecht: null,
    kategorien: [],
    select1: [],
    select2: [],
    select3: [],
    check1: false,
    pageNumber,
    pageSize: PAGE_SIZE,
  };
  const json = await fetchJson(`${BASE_URL}/API/api/courses`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!json.success) throw new Error(`Course API error: ${json.message ?? json.statusCode}`);
  return json.data;
}

async function fetchAllCourses(kurstyp, headers) {
  const first = await fetchCoursePage(kurstyp, 0, headers);
  const pageCount = Math.ceil(first.total / PAGE_SIZE);
  const remaining = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      fetchCoursePage(kurstyp, index + 1, headers)
    )
  );
  return [first, ...remaining].flatMap((page) => page.results ?? []);
}

async function mapLimit(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchCourseDetail(angebotId, headers) {
  const json = await fetchJson(`${BASE_URL}/API/api/courses/${angebotId}`, { headers });
  if (!json.success) throw new Error(`Course detail API error for ${angebotId}`);
  const detail = json.data;
  delete detail.bild;
  return detail;
}

function openDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      angebotId   INTEGER PRIMARY KEY,
      kurstypId   INTEGER NOT NULL,
      data        TEXT NOT NULL,
      lat         REAL,
      lng         REAL,
      approximate INTEGER NOT NULL DEFAULT 0,
      source      TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      fetched_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS lookups (
      type       TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS images (
      angebotId  INTEGER PRIMARY KEY,
      bild       TEXT NOT NULL,
      fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  return db;
}

function storeSeed(db, lookups, courses) {
  const now = Math.floor(Date.now() / 1000);
  const upsertLookup = db.prepare(
    "INSERT OR REPLACE INTO lookups (type, data, fetched_at) VALUES (?, ?, ?)"
  );
  const upsertCourse = db.prepare(
    `INSERT OR REPLACE INTO courses
      (angebotId, kurstypId, data, lat, lng, approximate, source, order_index, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const upsertImage = db.prepare(
    "INSERT OR REPLACE INTO images (angebotId, bild, fetched_at) VALUES (?, ?, ?)"
  );

  db.transaction(() => {
    db.prepare("DELETE FROM courses").run();
    db.prepare("DELETE FROM lookups").run();
    db.prepare("DELETE FROM images").run();

    for (const [type, data] of Object.entries(lookups)) {
      upsertLookup.run(type, JSON.stringify(data), now);
    }

    courses.forEach(({ course, lat, lng, approximate, source }, orderIndex) => {
      const { bild, ...courseWithoutImage } = course;
      upsertCourse.run(
        course.angebotId,
        course.kurstypId,
        JSON.stringify(courseWithoutImage),
        lat ?? null,
        lng ?? null,
        approximate ? 1 : 0,
        source ?? null,
        orderIndex,
        now
      );
      if (bild) upsertImage.run(course.angebotId, bild, now);
    });
  })();
}

async function main() {
  // Create the seed directory and remove any stale DB before any network
  // calls. If seeding fails the directory stays (so Docker COPY succeeds)
  // but the DB file is absent, preventing a previous seed from being
  // silently reused in the new image.
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  const { headers } = await getTokens();
  const venueOverrides = loadVenueOverrides();
  const lookups = await fetchLookups();
  const listCourses = (
    await Promise.all(COURSE_TYPES.map((kurstyp) => fetchAllCourses(kurstyp, headers)))
  ).flat();

  const detailById = new Map();
  await mapLimit(listCourses, DETAIL_CONCURRENCY, async (course) => {
    try {
      detailById.set(course.angebotId, await fetchCourseDetail(course.angebotId, headers));
    } catch (err) {
      console.warn(`Could not fetch detail for ${course.angebotId}: ${err.message}`);
    }
  });

  const courses = await mapLimit(listCourses, DETAIL_CONCURRENCY, async (course) => {
    const detail = detailById.get(course.angebotId);
    const coords = await coordinatesForCourse(course, detail, venueOverrides);
    return { course, ...coords };
  });

  const db = openDb();
  storeSeed(db, lookups, courses);
  db.close();

  const withCoordinates = courses.filter((course) => course.lat !== null && course.lng !== null);
  const approximate = courses.filter((course) => course.approximate);
  console.log(
    `Seeded ${courses.length} courses (${withCoordinates.length} with coordinates, ${approximate.length} approximate) and ${LOOKUP_TYPES.length} lookup tables into ${DB_PATH}`
  );
}

main().catch((err) => {
  console.error("[seed] Seed failed, build continues without pre-cached data:", err.message);
  process.exit(0);
});
