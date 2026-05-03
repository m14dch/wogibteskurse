import { NextRequest, NextResponse } from "next/server";
import { API_LIMITS, getClientIp, rateLimit } from "@/lib/apiProtection";
import { fetchLookups, SportPortalError } from "@/lib/sportPortal";

export async function GET(req: NextRequest) {
  const limit = rateLimit(`lookups:${getClientIp(req)}`, {
    limit: API_LIMITS.lookupsPerMinute(),
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es gleich nochmals." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const lookups = await fetchLookups();
    return NextResponse.json(lookups);
  } catch (err) {
    if (err instanceof SportPortalError) {
      const status = err.retryable ? 503 : 502;
      return NextResponse.json(
        { error: "Die Filter konnten nicht geladen werden. Bitte versuche es später nochmals." },
        { status }
      );
    }
    console.error("Unexpected lookups API failure", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Die Filter konnten nicht geladen werden. Bitte versuche es später nochmals." },
      { status: 502 }
    );
  }
}
