// app/api/claim/[id]/route.ts
// GET /api/claim/:id → returns the stored ClaimRecord, or 404.
import { NextRequest, NextResponse } from "next/server";
import { getClaim } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const record = await getClaim(id);
  if (!record) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }
  return NextResponse.json({ record });
}
