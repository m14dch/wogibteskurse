import type { NextRequest } from "next/server";

interface RateLimitState {
  count: number;
  resetAt: number;
}

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

const buckets = new Map<string, RateLimitState>();

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const API_LIMITS = {
  maxBodyBytes: () => envInt("API_MAX_BODY_BYTES", 10_000),
  coursesPerMinute: () => envInt("COURSES_RATE_LIMIT_PER_MINUTE", 30),
  lookupsPerMinute: () => envInt("LOOKUPS_RATE_LIMIT_PER_MINUTE", 60),
};

export function getClientIp(req: NextRequest): string {
  const flyClientIp = req.headers.get("fly-client-ip")?.trim();
  if (flyClientIp) return flyClientIp;

  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwardedFor) return forwardedFor;

  return "anonymous";
}

export function rateLimit(
  key: string,
  { limit, windowMs }: RateLimitConfig,
  now = Date.now()
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;

  if (buckets.size > 10_000) {
    for (const [bucketKey, state] of buckets) {
      if (state.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  return { ok: true };
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
