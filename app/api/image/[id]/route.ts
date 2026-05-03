import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

const getImage = db.prepare<[number], { bild: string }>(
  "SELECT bild FROM images WHERE angebotId = ?"
);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const angebotId = parseInt(id, 10);
  if (!isFinite(angebotId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const row = getImage.get(angebotId);
  if (!row) {
    return new NextResponse("Not found", { status: 404 });
  }

  const buffer = Buffer.from(row.bild, "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
