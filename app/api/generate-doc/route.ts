// app/api/generate-doc/route.ts
// GET /api/generate-doc?seed=123 → a synthetic prescription/bill (HTML + truth)
import { NextRequest, NextResponse } from "next/server";
import { generateDocument } from "@/lib/docGenerator";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const seedParam = req.nextUrl.searchParams.get("seed");
  const seed = seedParam ? Number(seedParam) : Math.floor(Math.random() * 10000);
  const doc = generateDocument(seed);
  return NextResponse.json({ doc });
}
