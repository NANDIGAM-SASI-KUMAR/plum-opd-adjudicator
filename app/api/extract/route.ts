// app/api/extract/route.ts
// -----------------------------------------------------------------------------
// POST /api/extract
// Body: { docs: { media_type, data(base64) }[], text?: string }
// Returns: ExtractedClaim
//
// This isolates the vision step so the UI can show "what we read" before the
// user commits to adjudication — great UX and great for debugging.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { extractClaim, type DocInput } from "@/lib/agents";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const docs: DocInput[] = body.docs ?? [];
    const text: string | undefined = body.text;

    if (docs.length === 0 && !text) {
      return NextResponse.json(
        { error: "Provide at least one document or some typed details." },
        { status: 400 },
      );
    }

    const extracted = await extractClaim(docs, text);
    return NextResponse.json({ extracted });
  } catch (err: any) {
    console.error("extract error:", err);
    return NextResponse.json({ error: err.message ?? "Extraction failed." }, { status: 500 });
  }
}
