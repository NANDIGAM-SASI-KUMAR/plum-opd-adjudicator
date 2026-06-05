// app/api/measure-accuracy/route.ts
// POST { text, truth } → runs extraction, compares to ground truth, returns report.
import { NextRequest, NextResponse } from "next/server";
import { extractClaim } from "@/lib/agents";
import { compareToTruth } from "@/lib/accuracy";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { text, truth } = await req.json();
    if (!truth) return NextResponse.json({ error: "Ground truth required." }, { status: 400 });
    const extracted = await extractClaim([], text ?? "");
    const report = compareToTruth(extracted, truth);
    return NextResponse.json({ report, extracted });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Accuracy check failed." }, { status: 500 });
  }
}
