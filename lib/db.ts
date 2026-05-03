import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import VENUE_OVERRIDES from "./venue-overrides.json";

const DB_PATH =
  process.env.DATABASE_PATH ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "geocode.db");
const SEED_DB_PATH =
  process.env.SEED_DATABASE_PATH ??
  path.join(/*turbopackIgnore: true*/ process.cwd(), ".seed", "geocode.db");

// Ensure the data directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL"); // concurrent reads during writes
db.pragma("cache_size = -2000"); // 2 MB page cache (default is ~8 MB)

db.exec(`
  CREATE TABLE IF NOT EXISTS venues (
    name      TEXT PRIMARY KEY,
    lat       REAL NOT NULL,
    lng       REAL NOT NULL,
    approximate INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Manual overrides: checked first, never overwritten by geocoding
  CREATE TABLE IF NOT EXISTS venue_overrides (
    name TEXT PRIMARY KEY,
    lat  REAL NOT NULL,
    lng  REAL NOT NULL,
    note TEXT
  );

  -- Course images cached from the Sport Portal API (base64 PNG)
  CREATE TABLE IF NOT EXISTS images (
    angebotId  INTEGER PRIMARY KEY,
    bild       TEXT NOT NULL,
    fetched_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  -- Build-time city portal cache. Used first at runtime; upstream API remains a fallback.
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
`);

// Seed overrides from source — idempotent, safe to run on every startup
const seedOverride = db.prepare(
  "INSERT OR REPLACE INTO venue_overrides (name, lat, lng, note) VALUES (?, ?, ?, ?)"
);
const seedAll = db.transaction(() => {
  for (const o of VENUE_OVERRIDES) {
    seedOverride.run(o.name, o.lat, o.lng, o.note);
  }
});
seedAll();

if (fs.existsSync(SEED_DB_PATH) && SEED_DB_PATH !== DB_PATH) {
  try {
    db.exec(`
      ATTACH DATABASE '${SEED_DB_PATH.replaceAll("'", "''")}' AS seed;

      DELETE FROM courses WHERE angebotId NOT IN (SELECT angebotId FROM seed.courses);
      DELETE FROM lookups WHERE type NOT IN (SELECT type FROM seed.lookups);
      DELETE FROM images WHERE angebotId NOT IN (SELECT angebotId FROM seed.images);

      INSERT OR REPLACE INTO courses
        (angebotId, kurstypId, data, lat, lng, approximate, source, order_index, fetched_at)
      SELECT angebotId, kurstypId, data, lat, lng, approximate, source, order_index, fetched_at
      FROM seed.courses;

      INSERT OR REPLACE INTO lookups (type, data, fetched_at)
      SELECT type, data, fetched_at
      FROM seed.lookups;

      INSERT OR REPLACE INTO images (angebotId, bild, fetched_at)
      SELECT angebotId, bild, fetched_at
      FROM seed.images;

      DETACH DATABASE seed;
    `);
  } catch (err) {
    console.error("Seed DB import failed, falling back to live upstream data:", err);
    try {
      db.exec("DETACH DATABASE seed");
    } catch {
      // already detached or was never attached — ignore
    }
  }
}

export default db;
