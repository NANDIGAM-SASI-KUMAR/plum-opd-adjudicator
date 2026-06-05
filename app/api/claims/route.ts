// app/api/claims/route.ts
// GET  /api/claims        → recent claims (for a history list)
// POST /api/claims/appeal → register an appeal on a claim (handled here via ?action)
import { NextRequest, NextResponse } from "next/server";
import { listClaims, getClaim, saveClaim } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const claims = await listClaims(50);
  // Return a lightweight summary list (not the whole record) for the table.
  const summary = claims.map((c) => ({
    claim_id: c.claim_id,
    created_at: c.created_at,
    member_name: c.member.member_name,
    decision: c.result.decision,
    approved_amount: c.result.approved_amount,
  }));
  return NextResponse.json({ claims: summary });
}

// POST /api/claims  body: { claim_id, reason }  → files an appeal → MANUAL_REVIEW
export async function POST(req: NextRequest) {
  const { claim_id, reason } = await req.json();
  const record = await getClaim(claim_id);
  if (!record) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }
  record.appeal = { requested_at: new Date().toISOString(), reason, resolved: false };
  record.result.decision = "MANUAL_REVIEW";
  record.status = "MANUAL_REVIEW";
  record.result.notes =
    "Member appealed the automated decision. " + record.result.notes;
  record.result.next_steps = "A claims specialist will review your appeal within 48 hours.";
  await saveClaim(record);
  return NextResponse.json({ ok: true, record });
}
