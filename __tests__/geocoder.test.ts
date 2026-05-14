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
// The geocoder tracks lastSwisstopo at module level.
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

// ── Tests ─────────────────────────────────────────────────────────────────────

import { geocodeVenue } from "@/lib/geocoder";

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

  it("rejects a swisstopo result with rank < 5 and falls back to city centre", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [{ attrs: { lat: 47.1, lon: 8.5, rank: 3 } }] }),
    });

    const result = await geocodeVenue("Vague Venue");

    expect(result.approximate).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockInsertRun).toHaveBeenCalledWith("Vague Venue", 47.3769, 8.5417, 1);
  });

  it("returns city centre (approximate) on transient swisstopo failure without caching", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);
    mockFetch.mockResolvedValue({ ok: false });

    const result = await geocodeVenue("Unknown Place");

    expect(result.approximate).toBe(true);
    expect(result.lat).toBeCloseTo(47.3769, 3);
    expect(result.lng).toBeCloseTo(8.5417, 3);
    // must NOT cache so the next request can retry swisstopo after it recovers
    expect(mockInsertRun).not.toHaveBeenCalled();
  });

  it("falls back to city centre when swisstopo returns empty results", async () => {
    mockOverrideGet.mockReturnValue(null);
    mockCacheGet.mockReturnValue(null);
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ results: [] }) });

    const result = await geocodeVenue("Truly Unknown");

    expect(result.approximate).toBe(true);
  });
});
