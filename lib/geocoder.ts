import db from "./db";

// Zürich city centre fallback
const ZURICH_CENTER = { lat: 47.3769, lng: 8.5417 };

const SWISSTOPO_RATE_MS = 200;

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Per-upstream dispatch queue. Callers are serialised through `gate` so each
// one waits for the previous dispatch to actually happen before computing its
// own wait. `nextAllowedAt` is written *after* the sleep (based on real
// Date.now()), so a late-firing timer cannot cause the next caller to
// under-space its request.
function makeRateLimiter(rateMs: number) {
  let nextAllowedAt = 0;
  let gate: Promise<unknown> = Promise.resolve();

  return function dispatch<T>(fn: () => Promise<T>): Promise<T> {
    const slot = gate.then(async () => {
      const wait = nextAllowedAt - Date.now();
      if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
      nextAllowedAt = Date.now() + rateMs;
    });
    // Advance the gate past the timing decision only (not the full fetch),
    // so the next caller queues behind dispatch timing, not response latency.
    // .catch keeps the gate healthy if something unexpected throws.
    gate = slot.catch(() => {});
    return slot.then(fn);
  };
}

const swisstopoDispatch = makeRateLimiter(SWISSTOPO_RATE_MS);

function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = envInt(
    "GEOCODER_FETCH_TIMEOUT_MS",
    envInt("UPSTREAM_FETCH_TIMEOUT_MS", 10_000)
  );
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "wogibteskurse/1.0 (https://github.com/m14dch/wogibteskurse)",
    },
  }).finally(() => clearTimeout(timer));
}

interface CachedVenue {
  lat: number;
  lng: number;
  approximate: boolean;
}

const overrideStmt = db.prepare<[string], { lat: number; lng: number }>(
  "SELECT lat, lng FROM venue_overrides WHERE name = ?"
);
const getStmt = db.prepare<[string], { lat: number; lng: number; approximate: number }>(
  "SELECT lat, lng, approximate FROM venues WHERE name = ?"
);
const insertStmt = db.prepare<[string, number, number, number]>(
  "INSERT OR REPLACE INTO venues (name, lat, lng, approximate) VALUES (?, ?, ?, ?)"
);

// Swisstopo rank: lower = broader geographic area (country/canton), higher = specific address.
// Ranks 1-4 are country/canton/commune — too vague to use as a venue location.
const MIN_SWISSTOPO_RANK = 5;

async function geocodeWithSwisstopo(name: string): Promise<CachedVenue | null> {
  try {
    const query = encodeURIComponent(`${name} Zürich`);
    const url = `https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&searchText=${query}&sr=4326&lang=de&limit=1`;
    const res = await swisstopoDispatch(() => fetchWithTimeout(url));
    if (!res.ok) return null;
    const json = await res.json();
    const attrs = json?.results?.[0]?.attrs;
    if (attrs?.lat && attrs?.lon && (attrs?.rank ?? 0) >= MIN_SWISSTOPO_RANK) {
      return { lat: attrs.lat, lng: attrs.lon, approximate: false };
    }
  } catch {
    // network error — fall through
  }
  return null;
}

export async function geocodeVenue(name: string): Promise<CachedVenue> {
  // 1. Manual override — highest priority, never replaced by API
  const override = overrideStmt.get(name);
  if (override) {
    return { lat: override.lat, lng: override.lng, approximate: false };
  }

  // 2. Cache hit
  const cached = getStmt.get(name);
  if (cached) {
    return { lat: cached.lat, lng: cached.lng, approximate: cached.approximate === 1 };
  }

  // 3. Swisstopo (rank-filtered)
  const swisstopo = await geocodeWithSwisstopo(name);
  if (swisstopo) {
    insertStmt.run(name, swisstopo.lat, swisstopo.lng, 0);
    return swisstopo;
  }

  // 4. Zürich centre — genuine unknown
  insertStmt.run(name, ZURICH_CENTER.lat, ZURICH_CENTER.lng, 1);
  return { ...ZURICH_CENTER, approximate: true };
}

export async function geocodeVenues(names: string[]): Promise<Map<string, CachedVenue>> {
  const result = new Map<string, CachedVenue>();
  for (const name of names) {
    result.set(name, await geocodeVenue(name));
  }
  return result;
}
