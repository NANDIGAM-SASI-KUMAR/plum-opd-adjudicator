// app/api/adjudicate/route.ts
// -----------------------------------------------------------------------------
// POST /api/adjudicate
// Body: { extracted: ExtractedClaim, member: MemberContext, explain?: boolean }
// Returns: { result: AdjudicationResult, claim_id }
//
// THE ORCHESTRATOR. Note the order:
//   1) run the deterministic engine  → the binding decision + audit trail
//   2) (optionally) ask Opus to NARRATE that decision  → llm_reasoning
//   3) persist everything
//
// The LLM step happens AFTER the decision and cannot change it. That ordering
// is the architecture's safety guarantee, made literal in code.
// -----------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { adjudicate } from "@/lib/ruleEngine";
import { explainDecision } from "@/lib/agents";
import { saveClaim } from "@/lib/db";
import { newClaimId } from "@/lib/id";
import type { ExtractedClaim, MemberContext } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const extracted: ExtractedClaim = body.extracted;
    const member: MemberContext = body.member;
    const explain: boolean = body.explain ?? true;

    if (!extracted || !member) {
      return NextResponse.json(
        { error: "Both 'extracted' and 'member' are required." },
        { status: 400 },
      );
    }

    const claimId = newClaimId();

    // 1) DETERMINISTIC decision — this is final.
    const result = adjudicate(claimId, extracted, member);

    // 2) Optional plain-English narration (does not affect numbers).
    if (explain) {
      try {
        result.llm_reasoning = await explainDecision(result, extracted);
      } catch (e) {
        // If the narrator fails, the decision still stands — degrade gracefully.
        result.llm_reasoning = result.notes;
      }
    }

    // 3) Persist.
    await saveClaim({
      claim_id: claimId,
      created_at: new Date().toISOString(),
      member,
      extracted,
      result,
      status: result.decision,
    });

    return NextResponse.json({ claim_id: claimId, result });
  } catch (err: any) {
    console.error("adjudicate error:", err);
    return NextResponse.json({ error: err.message ?? "Adjudication failed." }, { status: 500 });
  }
}
