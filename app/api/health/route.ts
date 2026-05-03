import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  try {
    // Verify DB is reachable
    db.prepare("SELECT 1").get();
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json({ status: "error", db: "unreachable" }, { status: 503 });
  }
}
