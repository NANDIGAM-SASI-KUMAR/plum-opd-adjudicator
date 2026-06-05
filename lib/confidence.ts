// lib/confidence.ts
// -----------------------------------------------------------------------------
// DERIVED CONFIDENCE SCORING
//
// Instead of a hard-coded confidence number, we compute it from real signals
// about how trustworthy the EXTRACTION and the DECISION are. This matters
// because adjudication_rules.md says: "System confidence < 70% → manual review."
// A confidence score is only meaningful if it actually moves with the quality
// of the input — a blurry, half-read document SHOULD score lower than a clean one.
//
// We return both the score and a transparent breakdown of the factors, so the UI
// can show *why* the score is what it is. That turns confidence from a magic
// number into something defensible.
// -----------------------------------------------------------------------------

import type { ExtractedClaim, Decision } from "@/types";

export interface ConfidenceFactor {
  label: string;
  weight: number;     // how much this factor contributes (0..1 of total)
  score: number;      // how well it scored (0..1)
  detail: string;
}

export interface ConfidenceResult {
  score: number;                 // final 0..1
  factors: ConfidenceFactor[];
  band: "high" | "medium" | "low";
}

const DOC_REG_STD = /^[A-Z]{2}\/\d{3,6}\/\d{4}$/;
const DOC_REG_AYUSH = /^[A-Z]{3,5}\/[A-Z]{2}\/\d{3,6}\/\d{4}$/;

export function scoreConfidence(
  extracted: ExtractedClaim,
  decision: Decision,
): ConfidenceResult {
  const factors: ConfidenceFactor[] = [];

  // --- Factor 1: field completeness (did we read the key fields?) ----------
  const keyFields = [
    extracted.diagnosis,
    extracted.doctor_reg,
    extracted.treatment_date,
    extracted.line_items.length > 0 ? "items" : undefined,
    extracted.total_amount,
  ];
  const found = keyFields.filter(Boolean).length;
  const completeness = found / keyFields.length;
  factors.push({
    label: "Field completeness",
    weight: 0.35,
    score: completeness,
    detail: `${found} of ${keyFields.length} key fields extracted`,
  });

  // --- Factor 2: document quality ------------------------------------------
  const q = extracted.document_quality ?? "clear";
  const qScore = q === "clear" ? 1 : q === "partial" ? 0.6 : 0.4;
  factors.push({
    label: "Document quality",
    weight: 0.2,
    score: qScore,
    detail: `Document reported as "${q}"`,
  });

  // --- Factor 3: doctor registration validity ------------------------------
  const reg = extracted.doctor_reg?.trim() ?? "";
  const regValid = DOC_REG_STD.test(reg) || DOC_REG_AYUSH.test(reg);
  factors.push({
    label: "Doctor reg. format",
    weight: 0.2,
    score: regValid ? 1 : reg ? 0.4 : 0,
    detail: regValid ? `Valid format (${reg})` : reg ? `Unrecognised format (${reg})` : "No registration found",
  });

  // --- Factor 4: amount reconciliation -------------------------------------
  const itemSum = extracted.line_items.reduce((s, li) => s + li.amount, 0);
  const stated = extracted.total_amount ?? itemSum;
  const reconciles = stated === 0 ? false : Math.abs(itemSum - stated) <= Math.max(1, stated * 0.02);
  factors.push({
    label: "Amounts reconcile",
    weight: 0.15,
    score: reconciles ? 1 : 0.5,
    detail: reconciles ? `Line items sum to total (₹${itemSum})` : `Items ₹${itemSum} vs stated ₹${stated}`,
  });

  // --- Factor 5: decision determinacy --------------------------------------
  // Clear-cut decisions (hard reject / clean approve) are more certain than
  // borderline ones routed to manual review.
  const decScore =
    decision === "MANUAL_REVIEW" ? 0.5 :
    decision === "PARTIAL" ? 0.85 : 1;
  factors.push({
    label: "Decision determinacy",
    weight: 0.1,
    score: decScore,
    detail: `Outcome: ${decision.replace("_", " ")}`,
  });

  // Weighted sum.
  let score = factors.reduce((s, f) => s + f.weight * f.score, 0);
  // Manual-review caps confidence below the review threshold by design.
  if (decision === "MANUAL_REVIEW") score = Math.min(score, 0.68);
  score = Math.round(score * 100) / 100;

  const band = score >= 0.85 ? "high" : score >= 0.7 ? "medium" : "low";
  return { score, factors, band };
}
