import db from "./db";

const BASE_URL = "https://www.stadt-zuerich.ch/sport-portal";
const LOOKUP_TYPES = [
  "aktivitaet",
  "ferientyp",
  "ferienwoche",
  "schulkreis",
  "kategorie",
  "jahrgangferien",
  "geschlecht",
] as const;

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const UPSTREAM_FETCH_TIMEOUT_MS = () => envInt("UPSTREAM_FETCH_TIMEOUT_MS", 10_000);
const SPORT_PORTAL_PAGE_CONCURRENCY = () => envInt("SPORT_PORTAL_PAGE_CONCURRENCY", 3);
const SPORT_PORTAL_MAX_TOTAL_PAGES = () => envInt("SPORT_PORTAL_MAX_TOTAL_PAGES", 40);
const COURSE_CACHE_MAX_ENTRIES = () => envInt("COURSE_CACHE_MAX_ENTRIES", 200);
const SPORT_PORTAL_RETRY_DELAY_MS = () => envInt("SPORT_PORTAL_RETRY_DELAY_MS", 250);
const USE_SEEDED_CACHE = () =>
  process.env.NODE_ENV !== "test" && process.env.DISABLE_SEEDED_COURSE_CACHE !== "1";
const SEEDED_CACHE_MAX_AGE_MS = () => envInt("SEEDED_CACHE_MAX_AGE_DAYS", 7) * 24 * 60 * 60 * 1000;

type SportPortalPhase =
  | "token"
  | "lookups"
  | "courses:first-page"
  | "courses:page"
  | "courses:schema"
  | "timeout";

export class SportPortalError extends Error {
  phase: SportPortalPhase;
  status?: number;
  retryable: boolean;
  publicMessage: string;
  pageNumber?: number;

  constructor(
    message: string,
    {
      phase,
      status,
      retryable = false,
      pageNumber,
      cause,
    }: {
      phase: SportPortalPhase;
      status?: number;
      retryable?: boolean;
      pageNumber?: number;
      cause?: unknown;
    }
  ) {
    super(message, { cause });
    this.name = "SportPortalError";
    this.phase = phase;
    this.status = status;
    this.retryable = retryable;
    this.pageNumber = pageNumber;
    this.publicMessage =
      "Die Kursdaten der Stadt Zürich sind gerade nicht erreichbar. Bitte versuche es später nochmals.";
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(): number {
  return SPORT_PORTAL_RETRY_DELAY_MS() + Math.floor(Math.random() * 100);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  phase: SportPortalPhase,
  pageNumber?: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_FETCH_TIMEOUT_MS());

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new SportPortalError("Sport portal request timed out", {
        phase: "timeout",
        retryable: true,
        pageNumber,
        cause: err,
      });
    }
    throw new SportPortalError("Sport portal network request failed", {
      phase,
      retryable: true,
      pageNumber,
      cause: err,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  phase: SportPortalPhase,
  pageNumber?: number
): Promise<Response> {
  let lastError: SportPortalError | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(retryDelay());

    try {
      const res = await fetchWithTimeout(url, init, phase, pageNumber);
      if (!res.ok) {
        throw new SportPortalError(`Sport portal ${phase} request failed: ${res.status}`, {
          phase,
          status: res.status,
          retryable: isRetryableStatus(res.status),
          pageNumber,
        });
      }
      return res;
    } catch (err) {
      if (err instanceof SportPortalError) {
        lastError = err;
        if (!err.retryable || attempt === 1) throw err;
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new SportPortalError("Sport portal request failed", { phase });
}

function logSportPortalError(err: unknown) {
  if (err instanceof SportPortalError) {
    console.error("Sport portal upstream failure", {
      phase: err.phase,
      status: err.status,
      retryable: err.retryable,
      pageNumber: err.pageNumber,
      message: err.message,
    });
    return;
  }

  console.error("Unexpected sport portal failure", {
    message: err instanceof Error ? err.message : String(err),
  });
}

function parseJsonObject(value: unknown, phase: SportPortalPhase, pageNumber?: number) {
  if (!value || typeof value !== "object") {
    throw new SportPortalError(`Sport portal ${phase} response was not an object`, {
      phase,
      pageNumber,
    });
  }
  return value as Record<string, unknown>;
}

function parseCoursePage(value: unknown, phase: SportPortalPhase, pageNumber: number) {
  const json = parseJsonObject(value, phase, pageNumber);
  if (json.success !== true) {
    throw new SportPortalError(`Sport portal API error during ${phase}`, {
      phase,
      pageNumber,
    });
  }

  const data = json.data;
  if (!data || typeof data !== "object") {
    throw new SportPortalError(`Sport portal ${phase} response missing data`, {
      phase: "courses:schema",
      pageNumber,
    });
  }

  const pageData = data as Record<string, unknown>;
  if (!Number.isFinite(pageData.total) || !Array.isArray(pageData.results)) {
    throw new SportPortalError(`Sport portal ${phase} response had invalid course shape`, {
      phase: "courses:schema",
      pageNumber,
    });
  }

  return pageData as { total: number; results: Course[] };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await fn(items[index], index);
      }
    })
  );

  return results;
}

export type LookupType = (typeof LOOKUP_TYPES)[number];

export interface LookupOption {
  key: string;
  value: string | number;
}

export interface CourseStatus {
  angebotStatusId: number;
  buchbar: boolean;
  aufWarteliste: boolean;
  ausgebucht: boolean;
  bedingteAnmeldung: boolean;
}

export interface Course {
  angebotId: number;
  nummer: string;
  titel: string;
  titelUrl: string;
  text: string;
  kurstypId: number;
  aktivitaetId: number;
  ferientypId: number;
  ferienwocheId: number;
  schulkreisId: number;
  kategorieId: number;
  geschlechtId: number;
  jahrgangVon: number;
  jahrgangBis: number;
  von: string;
  bis: string;
  zeitpunkt1: string;
  zeitpunkt2: string;
  zeitpunkt3: string;
  jahrgang: string;
  geschlecht: string;
  niveau: string;
  kursOrt: string;
  hatFreiePlaetze: boolean;
  hasBuchungscode: boolean;
  status?: CourseStatus;
  status1: string;
  status2?: string | null;
  statusClass?: string | null;
  anmeldeschluss: string;
  bild?: string;
  lat?: number | null;
  lng?: number | null;
  approximate?: boolean;
  coordinateSource?: string | null;
}

export interface CourseFilters {
  kurstyp?: number;
  aktivitaeten?: number[];
  schulkreis?: number[];
  ferienwochen?: number[];
  ferientyp?: number[];
  wochentage?: number[];
  jahrgaenge?: number[];
  geschlecht?: number | null;
  kategorien?: number[];
  check1?: boolean;
}

// XSRF token cache
interface TokenCache {
  xsrfToken: string;
  requestVerificationToken: string;
  fetchedAt: number;
}
let tokenCache: TokenCache | null = null;
const XSRF_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getTokens(): Promise<TokenCache> {
  if (tokenCache && Date.now() - tokenCache.fetchedAt < XSRF_TTL_MS) {
    return tokenCache;
  }

  // This endpoint sets both XSRF-TOKEN and __RequestVerificationToken cookies
  const res = await fetchWithRetry(`${BASE_URL}/API/api/accounts/currentuser`, {}, "token");

  const setCookieHeaders = res.headers.getSetCookie?.() ?? [];
  let xsrfToken: string | null = null;
  let requestVerificationToken: string | null = null;

  for (const header of setCookieHeaders) {
    const xsrfMatch = header.match(/XSRF-TOKEN=([^;]+)/);
    if (xsrfMatch) xsrfToken = decodeURIComponent(xsrfMatch[1]);

    const rvtMatch = header.match(/__RequestVerificationToken=([^;]+)/);
    if (rvtMatch) requestVerificationToken = decodeURIComponent(rvtMatch[1]);
  }

  if (!xsrfToken || !requestVerificationToken) {
    throw new SportPortalError("Could not obtain XSRF tokens from sport portal", {
      phase: "token",
    });
  }

  tokenCache = { xsrfToken, requestVerificationToken, fetchedAt: Date.now() };
  return tokenCache;
}

// Lookup cache
let lookupsCache: Record<LookupType, LookupOption[]> | null = null;
let lookupsFetchedAt = 0;
const LOOKUPS_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const getSeededLookupStmt = db.prepare<[string], { data: string }>(
  "SELECT data FROM lookups WHERE type = ?"
);

function fetchSeededLookups(): Record<LookupType, LookupOption[]> | null {
  if (!USE_SEEDED_CACHE()) return null;

  const seedFetchedAt = getSeedFetchedAt();
  if (!seedFetchedAt || Date.now() - seedFetchedAt * 1000 > SEEDED_CACHE_MAX_AGE_MS()) return null;

  const entries = LOOKUP_TYPES.map((type) => {
    const row = getSeededLookupStmt.get(type);
    if (!row) return null;
    return [type, JSON.parse(row.data)] as [LookupType, LookupOption[]];
  });

  if (entries.some((entry) => entry === null)) return null;
  return Object.fromEntries(entries as [LookupType, LookupOption[]][]) as Record<
    LookupType,
    LookupOption[]
  >;
}

export async function fetchLookups(): Promise<Record<LookupType, LookupOption[]>> {
  if (lookupsCache && Date.now() - lookupsFetchedAt < LOOKUPS_TTL_MS) {
    return lookupsCache;
  }

  const seeded = fetchSeededLookups();
  if (seeded) {
    lookupsCache = seeded;
    lookupsFetchedAt = Date.now();
    return seeded;
  }

  const entries = await Promise.all(
    LOOKUP_TYPES.map(async (type) => {
      const res = await fetchWithRetry(`${BASE_URL}/API/api/lookups/init/${type}`, {}, "lookups");
      const json = await res.json();
      const parsed = parseJsonObject(json, "lookups");
      if (parsed.success !== true || !Array.isArray(parsed.data)) {
        throw new SportPortalError(`Sport portal lookup response was invalid for ${type}`, {
          phase: "lookups",
        });
      }
      return [type, parsed.data] as [LookupType, LookupOption[]];
    })
  ).catch((err) => {
    logSportPortalError(err);
    throw err;
  });

  lookupsCache = Object.fromEntries(entries) as Record<LookupType, LookupOption[]>;
  lookupsFetchedAt = Date.now();
  return lookupsCache;
}

// Course result cache keyed by normalized filter params
interface CourseCacheEntry {
  data: Course[];
  fetchedAt: number;
}
const courseCache = new Map<string, CourseCacheEntry>();
const courseInFlight = new Map<string, Promise<Course[]>>();
const COURSES_TTL_MS = 5 * 60 * 1000;

const getSeededCoursesStmt = db.prepare<
  [number],
  {
    data: string;
    lat: number | null;
    lng: number | null;
    approximate: number;
    source: string | null;
  }
>(
  "SELECT data, lat, lng, approximate, source FROM courses WHERE kurstypId = ? ORDER BY order_index"
);

const getSeededFetchedAtStmt = db.prepare<[], { max_fetched_at: number | null }>(
  "SELECT MAX(fetched_at) AS max_fetched_at FROM courses"
);
// Cached once per process: the seed's build timestamp never changes at runtime.
let cachedSeedFetchedAt: number | null | undefined = undefined;
function getSeedFetchedAt(): number | null {
  if (cachedSeedFetchedAt !== undefined) return cachedSeedFetchedAt;
  const row = getSeededFetchedAtStmt.get();
  cachedSeedFetchedAt = row?.max_fetched_at ?? null;
  return cachedSeedFetchedAt;
}

function pruneCourseCache() {
  while (courseCache.size > COURSE_CACHE_MAX_ENTRIES()) {
    const oldestKey = courseCache.keys().next().value;
    if (!oldestKey) return;
    courseCache.delete(oldestKey);
  }
}

function cacheKey(filters: CourseFilters): string {
  return JSON.stringify({
    kurstyp: filters.kurstyp ?? 2,
    aktivitaeten: [...(filters.aktivitaeten ?? [])].sort(),
    schulkreis: [...(filters.schulkreis ?? [])].sort(),
    ferienwochen: [...(filters.ferienwochen ?? [])].sort(),
    ferientyp: [...(filters.ferientyp ?? [])].sort(),
    wochentage: [...(filters.wochentage ?? [])].sort(),
    jahrgaenge: [...(filters.jahrgaenge ?? [])].sort(),
    geschlecht: filters.geschlecht ?? null,
    kategorien: [...(filters.kategorien ?? [])].sort(),
    check1: filters.check1 ?? false,
  });
}

function includesAny(values: number[] | undefined, candidate: number): boolean {
  return !values?.length || values.includes(candidate);
}

function matchesYearFilter(course: Course, years: number[] | undefined): boolean {
  if (!years?.length) return true;
  return years.some((year) => year >= course.jahrgangVon && year <= course.jahrgangBis);
}

function matchesGenderFilter(course: Course, geschlecht: number | null | undefined): boolean {
  if (geschlecht === null || geschlecht === undefined) return true;
  return course.geschlechtId === geschlecht || course.geschlechtId === 3;
}

const GERMAN_WEEKDAY_IDS: Record<string, number> = {
  Montag: 1,
  Dienstag: 2,
  Mittwoch: 3,
  Donnerstag: 4,
  Freitag: 5,
  Samstag: 6,
  Sonntag: 7,
};

export function courseWeekdayIds(course: Course): number[] {
  const ids = new Set<number>();
  for (const z of [course.zeitpunkt1, course.zeitpunkt2, course.zeitpunkt3]) {
    if (!z) continue;

    // Single day, optionally followed by comma + time: "Montag" / "Montag, 14:00"
    const singleId = GERMAN_WEEKDAY_IDS[z.split(",")[0].trim()];
    if (singleId !== undefined) {
      ids.add(singleId);
      continue;
    }

    // Day range: "Montag bis Freitag"
    const rangeMatch = /^(\w+)\s+bis\s+(\w+)/.exec(z);
    if (rangeMatch) {
      const fromId = GERMAN_WEEKDAY_IDS[rangeMatch[1]];
      const toId = GERMAN_WEEKDAY_IDS[rangeMatch[2]];
      if (fromId !== undefined && toId !== undefined && fromId <= toId) {
        for (let d = fromId; d <= toId; d++) ids.add(d);
      }
    }
  }
  if (ids.size > 0) return [...ids];

  // Fallback for courses with no day info at all (e.g. drop-in sessions): derive from date range
  const from = new Date(course.von);
  const until = new Date(course.bis);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(until.getTime())) return [];
  const current = new Date(from);
  current.setHours(12, 0, 0, 0);
  const end = new Date(until);
  end.setHours(12, 0, 0, 0);
  while (current <= end) {
    const jsDay = current.getDay();
    ids.add(jsDay === 0 ? 7 : jsDay);
    current.setDate(current.getDate() + 1);
  }
  return [...ids];
}

function matchesWeekdayFilter(course: Course, wochentage: number[] | undefined): boolean {
  if (!wochentage?.length) return true;
  const courseDays = courseWeekdayIds(course);
  return wochentage.some((day) => courseDays.includes(day));
}

function matchesFilters(course: Course, filters: CourseFilters): boolean {
  // Keep this in sync with doFetchAllCourses' upstream request body. The seeded DB path applies
  // filters locally, while fallback requests let the city API apply the same filter set.
  return (
    includesAny(filters.aktivitaeten, course.aktivitaetId) &&
    includesAny(filters.schulkreis, course.schulkreisId) &&
    includesAny(filters.ferienwochen, course.ferienwocheId) &&
    includesAny(filters.ferientyp, course.ferientypId) &&
    includesAny(filters.kategorien, course.kategorieId) &&
    matchesYearFilter(course, filters.jahrgaenge) &&
    matchesGenderFilter(course, filters.geschlecht) &&
    matchesWeekdayFilter(course, filters.wochentage) &&
    (!filters.check1 || course.hatFreiePlaetze)
  );
}

function fetchSeededCourses(filters: CourseFilters): Course[] | null {
  if (!USE_SEEDED_CACHE()) return null;
  // check1 filters by live availability (hatFreiePlaetze) which changes continuously;
  // seeded values are stale so we must fall through to the upstream API.
  if (filters.check1) return null;

  const seedFetchedAt = getSeedFetchedAt();
  if (!seedFetchedAt || Date.now() - seedFetchedAt * 1000 > SEEDED_CACHE_MAX_AGE_MS()) return null;

  const rows = getSeededCoursesStmt.all(filters.kurstyp ?? 2);
  if (rows.length === 0) return null;

  return rows
    .map((row) => ({
      ...(JSON.parse(row.data) as Course),
      lat: row.lat,
      lng: row.lng,
      approximate: row.approximate === 1,
      coordinateSource: row.source,
    }))
    .filter((course) => matchesFilters(course, filters));
}

async function doFetchAllCourses(filters: CourseFilters): Promise<Course[]> {
  const seeded = fetchSeededCourses(filters);
  if (seeded) return seeded;

  const { xsrfToken, requestVerificationToken } = await getTokens();

  const cookieHeader = `__RequestVerificationToken=${requestVerificationToken}; XSRF-TOKEN=${xsrfToken}`;

  const body = {
    kurstyp: filters.kurstyp ?? 2,
    aktivitaeten: filters.aktivitaeten ?? [],
    // The city API uses select1 for Schulkreis; a literal schulkreis field is ignored upstream.
    select1: filters.schulkreis ?? [],
    ferienwochen: filters.ferienwochen ?? [],
    ferientyp: filters.ferientyp ?? [],
    wochentage: filters.wochentage ?? [],
    jahrgaenge: filters.jahrgaenge ?? [],
    geschlecht: filters.geschlecht ?? null,
    kategorien: filters.kategorien ?? [],
    select2: [],
    select3: [],
    check1: filters.check1 ?? false,
    pageNumber: 0,
    pageSize: 25,
  };

  const apiHeaders = {
    "Content-Type": "application/json",
    "x-xsrf-token": xsrfToken,
    Cookie: cookieHeader,
  };

  // Fetch first page to get total count
  const firstRes = await fetchWithRetry(
    `${BASE_URL}/API/api/courses`,
    {
      method: "POST",
      headers: apiHeaders,
      body: JSON.stringify(body),
    },
    "courses:first-page",
    0
  );

  const firstJson = await firstRes.json();
  const { total, results: firstPage } = parseCoursePage(firstJson, "courses:first-page", 0);

  if (total <= body.pageSize) {
    return firstPage;
  }

  const totalPages = Math.ceil(total / body.pageSize);
  if (totalPages > SPORT_PORTAL_MAX_TOTAL_PAGES()) {
    throw new SportPortalError("Sport portal returned too many pages", {
      phase: "courses:schema",
    });
  }

  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 1);
  const remainingPages = await mapWithConcurrency(
    pageNumbers,
    SPORT_PORTAL_PAGE_CONCURRENCY(),
    async (pageNumber) => {
      const res = await fetchWithRetry(
        `${BASE_URL}/API/api/courses`,
        {
          method: "POST",
          headers: apiHeaders,
          body: JSON.stringify({ ...body, pageNumber }),
        },
        "courses:page",
        pageNumber
      );
      const json = await res.json();
      return parseCoursePage(json, "courses:page", pageNumber).results;
    }
  );

  const allCourses = [...firstPage, ...remainingPages.flat()];

  return allCourses;
}

export async function fetchAllCourses(filters: CourseFilters): Promise<Course[]> {
  const key = cacheKey(filters);

  const cached = courseCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < COURSES_TTL_MS) {
    return cached.data;
  }

  // Coalesce concurrent cache-miss requests — share the in-flight promise
  const existing = courseInFlight.get(key);
  if (existing) return existing;

  const promise = doFetchAllCourses(filters)
    .then((data) => {
      courseCache.set(key, { data, fetchedAt: Date.now() });
      pruneCourseCache();
      return data;
    })
    .catch((err) => {
      logSportPortalError(err);
      throw err;
    })
    .finally(() => {
      courseInFlight.delete(key);
    });

  courseInFlight.set(key, promise);
  return promise;
}
