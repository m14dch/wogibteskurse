import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";

// ── DB mock ──────────────────────────────────────────────────────────────────
// vi.mock() is hoisted to the top of the file, before any const declarations.
// vi.hoisted() runs inside that hoisted block, so the mock fns are available.
const { mockOverrideGet, mockCacheGet, mockInsertRun } = vi.hoisted(() => ({
  mockOverrideGet: vi.fn(),
  mockCacheGet: vi.fn(),
  mockInsertRun: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  default: {
    prepare: vi.fn((sql: string) => {
      if (sql.includes("venue_overrides")) return { get: mockOverrideGet };
      if (sql.includes("INSERT")) return { run: mockInsertRun };
      return { get: mockCacheGet }; // SELECT lat, lng, approximate FROM venues
    }),
  },
}));

// ── fetch mock ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn();

// ── Rate-limiter workaround ───────────────────────────────────────────────────
// The geocoder tracks lastSwisstopo / lastNominatim at module level.
// We use fake timers with an ever-increasing offset (≥ 2 s per test) so that
// `Date.now() - lastRef.v` always exceeds the rate-limit delay and the
// setTimeout inside rateLimitedFetch is never triggered.
let fakeNow = new Date("2100-01-01").getTime();

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(fakeNow);
  vi.stubGlobal("fetch", mockFetch);
});

beforeEach(() => {
  fakeNow += 2_000; // advance by 2 s — always clears any rate-limit window
  vi.setSystemTime(fakeNow);
  mockOverrideGet.mockReset();
  mockCacheGet.mockReset();
  mockInsertRun.mockReset();
  mockFetch.mockReset();
});

afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function nominatimResponse(lat: string, lon: string) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve([{ lat, lon }]),
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

import { geocodeVenue } from "@/lib/geocoder";

// NOMINATIM_RATE_MS matches the constant in geocoder.ts
const NOMINATIM_RATE_MS = 1_100;

describe("geocodeVenue", () => {
  it("returns override coords without calling any API", async () => {
    mockOverrideGet.mockReturnValue({ lat: 47.38, lng: 8.55 });

    const result = await geocodeVenue("Some Venue");

    expect(result).toEqual({ lat: 47.38, lng: 8.55, approximate: false });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCacheGet).not.toHaveBeenCalled();
  });

  it("returns cached coords without calling any API", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue({ lat: 47.39, lng: 8.54, approximate: 0 });

    const result = await geocodeVenue("Cached Venue");

    expect(result).toEqual({ lat: 47.39, lng: 8.54, approximate: false });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("marks approximate: true when cache entry has approximate = 1", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue({ lat: 47.3769, lng: 8.5417, approximate: 1 });

    const result = await geocodeVenue("Unknown Venue");

    expect(result.approximate).toBe(true);
  });

  it("accepts a swisstopo result with rank >= 5 and caches it", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ attrs: { lat: 47.4, lon: 8.56, rank: 6 } }] }),
    });

    const result = await geocodeVenue("Good Venue");

    expect(result).toEqual({ lat: 47.4, lng: 8.56, approximate: false });
    expect(mockInsertRun).toHaveBeenCalledWith("Good Venue", 47.4, 8.56, 0);
  });

  it("rejects a swisstopo result with rank < 5 and falls through to Nominatim", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);

    // swisstopo returns low rank (country/canton level — too vague)
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ attrs: { lat: 47.1, lon: 8.5, rank: 3 } }] }),
      })
      // Nominatim succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([{ lat: "47.38", lon: "8.55" }]),
      });

    const result = await geocodeVenue("Vague Venue");

    expect(result).toEqual({ lat: 47.38, lng: 8.55, approximate: false });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockInsertRun).toHaveBeenCalledWith("Vague Venue", 47.38, 8.55, 0);
  });

  it("uses Nominatim when swisstopo returns no results", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      })
      .mockResolvedValueOnce(nominatimResponse("47.37", "8.52"));

    const result = await geocodeVenue("Nominatim Venue");

    expect(result).toEqual({ lat: 47.37, lng: 8.52, approximate: false });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to Zürich city centre (approximate) when both APIs fail", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);
    mockFetch.mockResolvedValue({ ok: false });

    const result = await geocodeVenue("Unknown Place");

    expect(result.approximate).toBe(true);
    expect(result.lat).toBeCloseTo(47.3769, 3);
    expect(result.lng).toBeCloseTo(8.5417, 3);
    expect(mockInsertRun).toHaveBeenCalledWith("Unknown Place", 47.3769, 8.5417, 1);
  });

  it("falls back to city centre when swisstopo returns empty results and Nominatim fails", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [] }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }); // nominatim: empty array

    const result = await geocodeVenue("Truly Unknown");

    expect(result.approximate).toBe(true);
  });
});

describe("Nominatim rate limiting", () => {
  // Each test in this suite needs swisstopo to fail so all calls reach Nominatim.
  // swisstopo (200 ms) and Nominatim (1 100 ms) use independent dispatch queues.
  beforeEach(() => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);
  });

  function setupFetchSpy() {
    const nominatimTimes: number[] = [];
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("geo.admin.ch")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ results: [] }) });
      }
      nominatimTimes.push(Date.now());
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ lat: "47.37", lon: "8.52" }]),
      });
    });
    return nominatimTimes;
  }

  it("spaces N concurrent Nominatim calls at least NOMINATIM_RATE_MS apart", async () => {
    const nominatimTimes = setupFetchSpy();
    const N = 3;

    const promises = Promise.all(
      Array.from({ length: N }, (_, i) => geocodeVenue(`Rate Test Venue ${i}`))
    );

    await vi.runAllTimersAsync();
    await promises;

    expect(nominatimTimes).toHaveLength(N);
    for (let i = 1; i < nominatimTimes.length; i++) {
      expect(nominatimTimes[i] - nominatimTimes[i - 1]).toBeGreaterThanOrEqual(NOMINATIM_RATE_MS);
    }
  });

  it("re-spaces calls correctly when a timer fires late (event-loop pause simulation)", async () => {
    // Scenario: A, B, C are concurrent. A dispatches immediately. B's Nominatim
    // timer was scheduled for ~1 100 ms after A, but the event loop is delayed
    // and the timer fires 600 ms late (at ~1 700 ms). C must still wait a full
    // NOMINATIM_RATE_MS from B's *actual* dispatch time, not from B's reserved slot.
    //
    // With the old slot-reservation approach (lastRef.v = slot before sleep),
    // C's slot was reserved at dispatch+2 200 ms — only 500 ms after B's late
    // fire at 1 700 ms, violating the 1 100 ms guarantee.
    //
    // With the queue approach, nextAllowedAt is written *after* the sleep based
    // on real Date.now(), so C's wait is always ≥ NOMINATIM_RATE_MS from B's
    // true fire time.
    const nominatimTimes = setupFetchSpy();

    const promises = Promise.all([
      geocodeVenue("Late Venue A"),
      geocodeVenue("Late Venue B"),
      geocodeVenue("Late Venue C"),
    ]);

    // Fire swisstopo timers (A:0 ms, B:200 ms, C:400 ms) so all three calls
    // reach the Nominatim queue. After this:
    //   • A's Nominatim fired immediately (no wait, nextAllowedAt = fakeNow+1100)
    //   • B's Nominatim timer is pending (~900 ms remaining, fires at fakeNow+1100)
    //   • C is queued behind B's timing gate (timer not yet scheduled)
    await vi.advanceTimersByTimeAsync(400);

    // Simulate a delayed event loop: jump the wall clock to fakeNow+1700, past
    // B's scheduled Nominatim fire time of fakeNow+1100. runAllTimersAsync then
    // fires overdue timers with Date.now() = fakeNow+1700.
    vi.setSystemTime(fakeNow + 1700);
    await vi.runAllTimersAsync();
    await promises;

    // A dispatched at fakeNow+0
    // B dispatched at fakeNow+1700 (late)
    // C must dispatch at fakeNow+1700+1100 = fakeNow+2800, not fakeNow+2200
    expect(nominatimTimes).toHaveLength(3);
    for (let i = 1; i < nominatimTimes.length; i++) {
      expect(nominatimTimes[i] - nominatimTimes[i - 1]).toBeGreaterThanOrEqual(NOMINATIM_RATE_MS);
    }
  });
});
