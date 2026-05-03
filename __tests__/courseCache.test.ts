import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CourseFilters } from "@/lib/sportPortal";

// Stub global fetch before any module is imported
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Each test gets a fresh module instance so module-level caches are empty
let fetchAllCourses: (filters: CourseFilters) => Promise<unknown[]>;

beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();
  process.env.SPORT_PORTAL_RETRY_DELAY_MS = "1";
  const mod = await import("@/lib/sportPortal");
  fetchAllCourses = mod.fetchAllCourses;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  delete process.env.COURSE_CACHE_MAX_ENTRIES;
  delete process.env.SPORT_PORTAL_MAX_TOTAL_PAGES;
  delete process.env.SPORT_PORTAL_PAGE_CONCURRENCY;
  delete process.env.UPSTREAM_FETCH_TIMEOUT_MS;
  delete process.env.SPORT_PORTAL_RETRY_DELAY_MS;
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTokenResponse() {
  const headers = new Headers();
  headers.append("set-cookie", "XSRF-TOKEN=test-xsrf; Path=/");
  headers.append("set-cookie", "__RequestVerificationToken=test-rvt; Path=/");
  return new Response("{}", { headers });
}

function makeCoursesResponse(courses: unknown[], total?: number) {
  return new Response(
    JSON.stringify({ success: true, data: { total: total ?? courses.length, results: courses } }),
    { headers: { "Content-Type": "application/json" } }
  );
}

const COURSE_A = { angebotId: 1, titel: "Schwimmen" };
const COURSE_B = { angebotId: 2, titel: "Tennis" };

function setupMock(courses: unknown[] = [COURSE_A]) {
  mockFetch.mockImplementation(async (url: string) => {
    if (String(url).includes("currentuser")) return makeTokenResponse();
    return makeCoursesResponse(courses);
  });
}

const BASE_FILTERS: CourseFilters = {
  kurstyp: 2,
  aktivitaeten: [],
  schulkreis: [],
  ferienwochen: [],
  ferientyp: [],
  wochentage: [],
  jahrgaenge: [],
  geschlecht: null,
  kategorien: [],
  check1: false,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("fetchAllCourses — caching and request coalescing", () => {
  it("fetches and returns data from upstream on first call", async () => {
    setupMock([COURSE_A]);
    const result = await fetchAllCourses(BASE_FILTERS);
    expect(result).toEqual([COURSE_A]);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("serves subsequent identical requests from cache without extra upstream calls", async () => {
    setupMock([COURSE_A]);
    await fetchAllCourses(BASE_FILTERS);
    const callsAfterFirst = mockFetch.mock.calls.length;

    await fetchAllCourses(BASE_FILTERS);
    // No additional fetch calls should have been made
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it("cache hit returns the same data as the original fetch", async () => {
    setupMock([COURSE_A]);
    const first = await fetchAllCourses(BASE_FILTERS);
    const second = await fetchAllCourses(BASE_FILTERS);
    expect(second).toEqual(first);
  });

  it("re-fetches after the 5-minute TTL has elapsed", async () => {
    vi.useFakeTimers();
    setupMock([COURSE_A]);

    await fetchAllCourses(BASE_FILTERS);
    const callsAfterFirst = mockFetch.mock.calls.length;

    // Advance past the 5-minute cache TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    await fetchAllCourses(BASE_FILTERS);
    expect(mockFetch.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it("does not re-fetch before the TTL has elapsed", async () => {
    vi.useFakeTimers();
    setupMock([COURSE_A]);

    await fetchAllCourses(BASE_FILTERS);
    const callsAfterFirst = mockFetch.mock.calls.length;

    vi.advanceTimersByTime(5 * 60 * 1000 - 1); // just under TTL

    await fetchAllCourses(BASE_FILTERS);
    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it("coalesces concurrent cache-miss requests into a single upstream fetch", async () => {
    setupMock([COURSE_A]);

    // Both calls start before either resolves — second should share the in-flight promise
    const [r1, r2] = await Promise.all([
      fetchAllCourses(BASE_FILTERS),
      fetchAllCourses(BASE_FILTERS),
    ]);

    // Both return the same data
    expect(r1).toEqual([COURSE_A]);
    expect(r2).toEqual([COURSE_A]);

    // Only one upstream fetch chain (token + courses), not two
    const coursesFetchCalls = mockFetch.mock.calls.filter((c) => String(c[0]).includes("/courses"));
    expect(coursesFetchCalls).toHaveLength(1);
  });

  it("uses separate cache entries for different filter combinations", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      // Return different courses depending on kurstyp in the request body
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return makeCoursesResponse(body.kurstyp === 1 ? [COURSE_B] : [COURSE_A]);
    });

    const r1 = await fetchAllCourses({ ...BASE_FILTERS, kurstyp: 2 });
    const r2 = await fetchAllCourses({ ...BASE_FILTERS, kurstyp: 1 });

    expect(r1).toEqual([COURSE_A]);
    expect(r2).toEqual([COURSE_B]);
  });

  it("treats filter arrays as order-independent for cache key purposes", async () => {
    setupMock([COURSE_A]);

    const r1 = await fetchAllCourses({ ...BASE_FILTERS, jahrgaenge: [2015, 2016] });
    const callsAfterFirst = mockFetch.mock.calls.length;

    // Same values in different order — should hit the same cache entry
    const r2 = await fetchAllCourses({ ...BASE_FILTERS, jahrgaenge: [2016, 2015] });

    expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
    expect(r2).toEqual(r1);
  });

  it("sends Schulkreis filters as select1 to the upstream API", async () => {
    setupMock([COURSE_A]);

    await fetchAllCourses({ ...BASE_FILTERS, schulkreis: [1, 5] });

    const coursesCall = mockFetch.mock.calls.find((call) => String(call[0]).endsWith("/courses"));
    const body = JSON.parse(String(coursesCall?.[1]?.body));
    expect(body.select1).toEqual([1, 5]);
  });

  it("clears the in-flight entry on error so the next call can retry", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ success: false, message: "Portal error" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return makeCoursesResponse([COURSE_A]);
    });

    await expect(fetchAllCourses(BASE_FILTERS)).rejects.toThrow("courses:first-page");

    // Second call should retry (not return a cached error)
    const result = await fetchAllCourses(BASE_FILTERS);
    expect(result).toEqual([COURSE_A]);
  });

  it("propagates upstream API errors correctly", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      return new Response(JSON.stringify({ success: false, message: "Portal error" }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(fetchAllCourses(BASE_FILTERS)).rejects.toThrow("Sport portal API error during");
  });

  it("propagates upstream HTTP errors correctly", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      return new Response("bad gateway", { status: 502 });
    });

    await expect(fetchAllCourses(BASE_FILTERS)).rejects.toThrow(
      "Sport portal courses:first-page request failed: 502"
    );
  });

  it("retries one transient course HTTP failure", async () => {
    let courseCalls = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      courseCalls++;
      if (courseCalls === 1) return new Response("bad gateway", { status: 502 });
      return makeCoursesResponse([COURSE_A]);
    });

    const result = await fetchAllCourses(BASE_FILTERS);

    expect(result).toEqual([COURSE_A]);
    expect(courseCalls).toBe(2);
  });

  it("does not retry non-retryable upstream API errors", async () => {
    let courseCalls = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      courseCalls++;
      return new Response(JSON.stringify({ success: false, message: "Portal error" }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(fetchAllCourses(BASE_FILTERS)).rejects.toThrow("courses:first-page");
    expect(courseCalls).toBe(1);
  });

  it("distinguishes token failures from course failures", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("currentuser")) return new Response("unavailable", { status: 503 });
      return makeCoursesResponse([COURSE_A]);
    });

    await expect(fetchAllCourses(BASE_FILTERS)).rejects.toMatchObject({
      phase: "token",
      status: 503,
      retryable: true,
    });
  });

  it("rejects unexpectedly large upstream page counts", async () => {
    process.env.SPORT_PORTAL_MAX_TOTAL_PAGES = "2";
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      return makeCoursesResponse([COURSE_A], 100);
    });

    await expect(fetchAllCourses(BASE_FILTERS)).rejects.toThrow(
      "Sport portal returned too many pages"
    );
  });

  it("bounds the course cache size", async () => {
    process.env.COURSE_CACHE_MAX_ENTRIES = "1";
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      return makeCoursesResponse(body.kurstyp === 1 ? [COURSE_B] : [COURSE_A]);
    });

    await fetchAllCourses({ ...BASE_FILTERS, kurstyp: 2 });
    await fetchAllCourses({ ...BASE_FILTERS, kurstyp: 1 });
    const courseCallsAfterTwoKeys = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/courses")
    ).length;

    await fetchAllCourses({ ...BASE_FILTERS, kurstyp: 2 });
    const courseCallsAfterEvictedKey = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes("/courses")
    ).length;

    expect(courseCallsAfterEvictedKey).toBe(courseCallsAfterTwoKeys + 1);
  });

  it("handles multi-page responses by fetching all pages", async () => {
    const page1 = [COURSE_A];
    const page2 = [COURSE_B];
    let pageCall = 0;

    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.pageNumber === 0) {
        return makeCoursesResponse(page1, 50); // total=50 triggers multi-page fetch
      }
      pageCall++;
      return makeCoursesResponse(page2, 50);
    });

    const result = await fetchAllCourses(BASE_FILTERS);
    expect(result).toContainEqual(COURSE_A);
    expect(result).toContainEqual(COURSE_B);
    expect(pageCall).toBeGreaterThan(0);
  });

  it("fails clearly when a later course page returns an API error", async () => {
    mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("currentuser")) return makeTokenResponse();
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.pageNumber === 0) {
        return makeCoursesResponse([COURSE_A], 50);
      }
      return new Response(JSON.stringify({ success: false, message: "Portal error" }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(fetchAllCourses(BASE_FILTERS)).rejects.toMatchObject({
      phase: "courses:page",
      pageNumber: 1,
    });
  });
});
