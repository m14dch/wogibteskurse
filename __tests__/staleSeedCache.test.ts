import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── DB mock ───────────────────────────────────────────────────────────────────
const {
  mockFetchedAtGet,
  mockLookupFetchedAtGet,
  mockLookupRowGet,
  mockSeededCoursesAll,
  mockInsertRun,
  mockDeleteRun,
  mockOrphanedImagesDeleteRun,
  mockTransaction,
} = vi.hoisted(() => ({
  mockFetchedAtGet: vi.fn(),
  mockLookupFetchedAtGet: vi.fn(),
  mockLookupRowGet: vi.fn(),
  mockSeededCoursesAll: vi.fn(),
  mockInsertRun: vi.fn(),
  mockDeleteRun: vi.fn(),
  mockOrphanedImagesDeleteRun: vi.fn(),
  mockTransaction: vi.fn((fn: () => void) => fn),
}));

vi.mock("@/lib/db", () => ({
  default: {
    prepare: vi.fn((sql: string) => {
      if (sql.includes("MAX(fetched_at)")) return { get: mockFetchedAtGet };
      if (sql.includes("MIN(fetched_at)")) return { get: mockLookupFetchedAtGet };
      if (sql.includes("FROM lookups WHERE type")) return { get: mockLookupRowGet };
      if (sql.includes("SELECT data") && sql.includes("kurstypId"))
        return { all: mockSeededCoursesAll };
      if (sql.includes("INSERT")) return { run: mockInsertRun };
      if (sql.includes("DELETE FROM courses")) return { run: mockDeleteRun };
      if (sql.includes("DELETE FROM images")) return { run: mockOrphanedImagesDeleteRun };
      return { get: vi.fn().mockReturnValue(null), all: vi.fn().mockReturnValue([]), run: vi.fn() };
    }),
    transaction: mockTransaction,
  },
}));

// ── fetch mock ────────────────────────────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Module under test ─────────────────────────────────────────────────────────
import { fetchAllCourses, fetchLookups, _resetForTests } from "@/lib/sportPortal";
import type { Course } from "@/lib/sportPortal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const now = () => Math.floor(Date.now() / 1000);
const daysAgo = (d: number) => now() - d * 24 * 60 * 60;

function makeMinimalCourse(overrides: Partial<Course> = {}): Course {
  return {
    angebotId: 1,
    nummer: "TEST 1",
    titel: "Test Course",
    titelUrl: "Test_Course",
    text: "",
    kurstypId: 2,
    aktivitaetId: 1,
    ferientypId: 2,
    ferienwocheId: 1,
    schulkreisId: 1,
    kategorieId: 1,
    geschlechtId: 3,
    jahrgangVon: 2014,
    jahrgangBis: 2018,
    von: "2026-07-13T10:00:00",
    bis: "2026-07-17T16:00:00",
    zeitpunkt1: "",
    zeitpunkt2: "",
    zeitpunkt3: "",
    jahrgang: "",
    geschlecht: "",
    niveau: "",
    kursOrt: "Test Venue",
    hatFreiePlaetze: true,
    hasBuchungscode: false,
    status1: "",
    anmeldeschluss: "0001-01-01T00:00:00",
    lat: 47.38,
    lng: 8.55,
    approximate: false,
    ...overrides,
  };
}

function seededRow(course: Course) {
  return {
    data: JSON.stringify(course),
    lat: course.lat ?? null,
    lng: course.lng ?? null,
    approximate: course.approximate ? 1 : 0,
    source: "city-detail",
  };
}

function mockTokenResponse() {
  return {
    ok: true,
    headers: {
      getSetCookie: () => ["XSRF-TOKEN=tok; Path=/", "__RequestVerificationToken=rvt; Path=/"],
    },
  };
}

function mockCoursePage(courses: Course[], total?: number) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { total: total ?? courses.length, results: courses },
      }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("stale-while-revalidate seed cache", () => {
  beforeEach(() => {
    _resetForTests();
    mockFetchedAtGet.mockReset();
    mockLookupFetchedAtGet.mockReset();
    mockLookupRowGet.mockReset();
    mockSeededCoursesAll.mockReset();
    mockInsertRun.mockReset();
    mockDeleteRun.mockReset();
    mockOrphanedImagesDeleteRun.mockReset();
    mockFetch.mockReset();
    // Vitest sets NODE_ENV=test which disables the seeded cache; override for these tests.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_SEEDED_COURSE_CACHE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns seeded data immediately when seed is fresh", async () => {
    const course = makeMinimalCourse();
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(1) }); // 1 day old — fresh
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    const result = await fetchAllCourses({ kurstyp: 2 });

    expect(result).toHaveLength(1);
    expect(result[0].angebotId).toBe(1);
    expect(mockFetch).not.toHaveBeenCalled(); // no upstream API calls
  });

  it("returns stale seeded data immediately without waiting for background refresh", async () => {
    const course = makeMinimalCourse();
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(10) }); // 10 days old — stale
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    // Background refresh will call fetch — resolve it so the test doesn't hang
    mockFetch
      .mockResolvedValueOnce(mockTokenResponse()) // token
      .mockResolvedValue(mockCoursePage([], 0)); // all course pages return empty

    const result = await fetchAllCourses({ kurstyp: 2 });

    // Stale data returned synchronously — doesn't wait for background fetch
    expect(result).toHaveLength(1);
    expect(result[0].angebotId).toBe(1);
  });

  it("triggers a background refresh when seed is stale", async () => {
    const course = makeMinimalCourse();
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(10) });
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    const fetchCalled = new Promise<void>((resolve) => {
      mockFetch.mockImplementation(() => {
        resolve();
        return Promise.resolve(mockTokenResponse());
      });
    });

    await fetchAllCourses({ kurstyp: 2 });

    // Background refresh should call fetch (for token at minimum)
    await fetchCalled;
    expect(mockFetch).toHaveBeenCalled();
  });

  it("does NOT trigger a background refresh when seed is fresh", async () => {
    const course = makeMinimalCourse();
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(1) }); // fresh
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    await fetchAllCourses({ kurstyp: 2 });

    // Allow any microtasks to settle
    await Promise.resolve();

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls through to live API when there is no seeded data", async () => {
    mockFetchedAtGet.mockReturnValue(null); // no seed at all
    mockSeededCoursesAll.mockReturnValue([]);

    mockFetch
      .mockResolvedValueOnce(mockTokenResponse())
      .mockResolvedValueOnce(mockCoursePage([makeMinimalCourse()]));

    const result = await fetchAllCourses({ kurstyp: 2 });

    expect(result).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("falls through to live API for check1=true when seed is stale", async () => {
    const course = makeMinimalCourse({ hatFreiePlaetze: true });
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(10) }); // stale
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    // Background refresh also starts here (finding 2), so use method-based dispatch:
    // GET = token/lookup fetches, POST = course page fetches.
    mockFetch.mockImplementation((_url: unknown, init?: { method?: string }) =>
      Promise.resolve(init?.method === "POST" ? mockCoursePage([course]) : mockTokenResponse())
    );

    const result = await fetchAllCourses({ kurstyp: 2, check1: true });

    // check1 + stale seed → live API was called (not stale seeded data)
    expect(mockFetch).toHaveBeenCalled();
    expect(result).toHaveLength(1);
  });

  it("serves check1=true from seeded data when seed is fresh", async () => {
    const course = makeMinimalCourse({ hatFreiePlaetze: true });
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(1) }); // fresh
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    const result = await fetchAllCourses({ kurstyp: 2, check1: true });

    expect(result).toHaveLength(1);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("runs only one background refresh when two concurrent requests see stale seed (same key)", async () => {
    const course = makeMinimalCourse();
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(10) });
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);
    mockFetch.mockResolvedValue(mockTokenResponse());

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Same filter key — coalesced via courseInFlight, only one doFetchAllCourses runs
      await Promise.all([fetchAllCourses({ kurstyp: 2 }), fetchAllCourses({ kurstyp: 2 })]);

      const startedCount = consoleSpy.mock.calls.filter(
        (args) => args[0] === "[cache] Background course cache refresh started"
      ).length;
      expect(startedCount).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("runs only one background refresh when two concurrent requests have different filter keys", async () => {
    const course = makeMinimalCourse();
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(10) });
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);
    mockFetch.mockResolvedValue(mockTokenResponse());

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      // Different filter keys → two separate doFetchAllCourses calls, but only one refresh
      await Promise.all([fetchAllCourses({ kurstyp: 1 }), fetchAllCourses({ kurstyp: 2 })]);

      const startedCount = consoleSpy.mock.calls.filter(
        (args) => args[0] === "[cache] Background course cache refresh started"
      ).length;
      expect(startedCount).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("deletes stale courses from SQLite during background refresh (snapshot replacement)", async () => {
    const course = makeMinimalCourse();
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(10) }); // stale
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    // Resolve when DELETE runs — proves the transaction performed snapshot replacement
    let resolveDeleteCalled!: () => void;
    const deleteCalled = new Promise<void>((resolve) => {
      resolveDeleteCalled = resolve;
    });
    mockDeleteRun.mockImplementation(() => resolveDeleteCalled());

    const freshCourse = makeMinimalCourse({ angebotId: 99 });
    mockFetch.mockImplementation((_url: unknown, init?: { method?: string }) =>
      Promise.resolve(init?.method === "POST" ? mockCoursePage([freshCourse]) : mockTokenResponse())
    );

    await fetchAllCourses({ kurstyp: 2 }); // returns stale data, triggers background refresh
    await deleteCalled; // wait until the transaction's DELETE executes

    expect(mockDeleteRun).toHaveBeenCalled();
  });

  it("triggers background refresh when check1=true and seed is stale", async () => {
    const course = makeMinimalCourse({ hatFreiePlaetze: true });
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(10) }); // stale
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    mockFetch.mockImplementation((_url: unknown, init?: { method?: string }) =>
      Promise.resolve(init?.method === "POST" ? mockCoursePage([course]) : mockTokenResponse())
    );

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await fetchAllCourses({ kurstyp: 2, check1: true });

      const startedCount = consoleSpy.mock.calls.filter(
        (args) => args[0] === "[cache] Background course cache refresh started"
      ).length;
      expect(startedCount).toBe(1);
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("deletes orphaned image rows for courses removed from upstream API", async () => {
    const course = makeMinimalCourse();
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(10) }); // stale
    mockSeededCoursesAll.mockReturnValue([seededRow(course)]);

    let resolveOrphanDeleteCalled!: () => void;
    const orphanDeleteCalled = new Promise<void>((resolve) => {
      resolveOrphanDeleteCalled = resolve;
    });
    mockOrphanedImagesDeleteRun.mockImplementation(() => resolveOrphanDeleteCalled());

    const freshCourse = makeMinimalCourse({ angebotId: 99 });
    mockFetch.mockImplementation((_url: unknown, init?: { method?: string }) =>
      Promise.resolve(init?.method === "POST" ? mockCoursePage([freshCourse]) : mockTokenResponse())
    );

    await fetchAllCourses({ kurstyp: 2 });
    await orphanDeleteCalled;

    expect(mockOrphanedImagesDeleteRun).toHaveBeenCalled();
  });
});

describe("seeded lookup cache", () => {
  beforeEach(() => {
    _resetForTests();
    mockLookupFetchedAtGet.mockReset();
    mockLookupRowGet.mockReset();
    mockFetch.mockReset();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DISABLE_SEEDED_COURSE_CACHE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falls through to live API when lookup MIN(fetched_at) is stale even if courses are fresh", async () => {
    mockFetchedAtGet.mockReturnValue({ max_fetched_at: daysAgo(1) }); // courses fresh
    mockLookupFetchedAtGet.mockReturnValue({ min_fetched_at: daysAgo(10) }); // lookups stale

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    });

    await fetchLookups();

    expect(mockFetch).toHaveBeenCalled(); // lookup freshness check failed → live API
  });

  it("serves lookups from seed when all lookup types have fresh MIN(fetched_at)", async () => {
    mockLookupFetchedAtGet.mockReturnValue({ min_fetched_at: daysAgo(1) }); // fresh
    mockLookupRowGet.mockReturnValue({ data: "[]" }); // each type returns empty array

    const result = await fetchLookups();

    expect(mockFetch).not.toHaveBeenCalled(); // served from seed
    expect(result).toBeDefined();
  });
});
