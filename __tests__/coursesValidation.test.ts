import { beforeEach, describe, it, expect, vi } from "vitest";

// Mock heavy server-side deps so the route module can be imported in tests
vi.mock("@/lib/sportPortal", () => {
  class SportPortalError extends Error {
    retryable: boolean;
    publicMessage =
      "Die Kursdaten der Stadt Zürich sind gerade nicht erreichbar. Bitte versuche es später nochmals.";

    constructor(message: string, retryable = false) {
      super(message);
      this.retryable = retryable;
    }
  }

  return { fetchAllCourses: vi.fn().mockResolvedValue([]), SportPortalError };
});
vi.mock("@/lib/geocoder", () => ({ geocodeVenues: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("@/lib/db", () => ({
  default: {
    prepare: vi.fn().mockReturnValue({ get: vi.fn(), run: vi.fn() }),
    transaction: vi.fn().mockImplementation((fn: () => void) => fn),
  },
}));

import { POST } from "@/app/api/courses/route";
import { resetRateLimitsForTests } from "@/lib/apiProtection";
import { fetchAllCourses, SportPortalError } from "@/lib/sportPortal";

const validBody = {
  kurstyp: 2,
  ferientyp: [],
  ferienwochen: [],
  aktivitaeten: [],
  schulkreis: [],
  kategorien: [],
  jahrgaenge: [],
  geschlecht: null,
  check1: false,
};

function makeRequest(body: unknown, headers: HeadersInit = {}) {
  return new Request("http://localhost/api/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/courses — input validation", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    vi.mocked(fetchAllCourses).mockResolvedValue([]);
    delete process.env.API_MAX_BODY_BYTES;
    delete process.env.COURSES_RATE_LIMIT_PER_MINUTE;
  });

  it("accepts a valid body", async () => {
    const res = await POST(makeRequest(validBody) as never);
    expect(res.status).toBe(200);
  });

  it("rejects invalid JSON", async () => {
    const req = new Request("http://localhost/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("rejects invalid kurstyp", async () => {
    const res = await POST(makeRequest({ ...validBody, kurstyp: 99 }) as never);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/kurstyp/);
  });

  it("rejects non-array ferientyp", async () => {
    const res = await POST(makeRequest({ ...validBody, ferientyp: "2" }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects array containing non-numbers", async () => {
    const res = await POST(makeRequest({ ...validBody, kategorien: ["abc"] }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects array containing non-integer numbers", async () => {
    const res = await POST(makeRequest({ ...validBody, kategorien: [1.5] }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects array containing negative numbers", async () => {
    const res = await POST(makeRequest({ ...validBody, kategorien: [-1] }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects oversized filter arrays", async () => {
    const res = await POST(
      makeRequest({ ...validBody, aktivitaeten: Array.from({ length: 101 }, (_, i) => i) }) as never
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/aktivitaeten/);
  });

  it("rejects invalid check1 type", async () => {
    const res = await POST(makeRequest({ ...validBody, check1: "true" }) as never);
    expect(res.status).toBe(400);
  });

  it("rejects malformed bounds", async () => {
    const res = await POST(
      makeRequest({ ...validBody, bounds: { north: "a", south: 0, east: 0, west: 0 } }) as never
    );
    expect(res.status).toBe(400);
  });

  it("rejects inverted bounds", async () => {
    const res = await POST(
      makeRequest({
        ...validBody,
        bounds: { north: 47.3, south: 47.5, east: 8.6, west: 8.4 },
      }) as never
    );
    expect(res.status).toBe(400);
  });

  it("rejects out-of-range bounds", async () => {
    const res = await POST(
      makeRequest({
        ...validBody,
        bounds: { north: 91, south: 47.3, east: 8.6, west: 8.4 },
      }) as never
    );
    expect(res.status).toBe(400);
  });

  it("accepts valid bounds", async () => {
    const res = await POST(
      makeRequest({
        ...validBody,
        bounds: { north: 47.5, south: 47.3, east: 8.6, west: 8.4 },
      }) as never
    );
    expect(res.status).toBe(200);
  });

  it("rejects oversized request bodies before parsing", async () => {
    process.env.API_MAX_BODY_BYTES = "10";
    const res = await POST(makeRequest(validBody, { "content-length": "1000" }) as never);
    expect(res.status).toBe(413);
  });

  it("rate limits repeated requests from the same client", async () => {
    process.env.COURSES_RATE_LIMIT_PER_MINUTE = "2";
    const headers = { "fly-client-ip": "203.0.113.10" };

    expect((await POST(makeRequest(validBody, headers) as never)).status).toBe(200);
    expect((await POST(makeRequest(validBody, headers) as never)).status).toBe(200);

    const limited = await POST(makeRequest(validBody, headers) as never);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("returns a stable public message for upstream failures", async () => {
    vi.mocked(fetchAllCourses).mockRejectedValueOnce(
      new SportPortalError("token failed", { phase: "token", retryable: true })
    );

    const res = await POST(makeRequest(validBody) as never);
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.error).toMatch(/Stadt Zürich/);
    expect(json.error).not.toMatch(/token failed/);
  });
});
