// app/api/eval/route.ts
// GET /api/eval → runs all test cases through the engine and returns a scored summary.
import { NextResponse } from "next/server";
import { runEval } from "@/lib/evalRunner";

export const runtime = "nodejs";

export async function GET() {
  const summary = runEval();
  return NextResponse.json(summary);
}
