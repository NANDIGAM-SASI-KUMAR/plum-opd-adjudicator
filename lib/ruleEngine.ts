// lib/ruleEngine.ts
// =============================================================================
// THE DETERMINISTIC RULE ENGINE — the heart of this project.
//
// DESIGN PRINCIPLE (say this in the interview):
//   The LLM is allowed to *read* documents. It is NEVER allowed to *decide*
//   money. Every rupee approved or rejected here is the output of plain,
//   testable TypeScript that maps directly to a clause in policy_terms.json.
//   That makes the system auditable: for any decision we can point at the exact
//   line of code AND the exact policy clause that produced it.
//
// The engine runs the five steps from adjudication_rules.md *in order* and
// records a RuleTrace for every check. The trace IS the explainability.
// =============================================================================

import type {
  AdjudicationResult,
  ExtractedClaim,
  MemberContext,
  RuleTrace,
  RejectionCode,
  ServiceCategory,
  LineItem,
} from "@/types";
import policy from "@/data/policy_terms.json";
import { scoreConfidence } from "@/lib/confidence";

// ---- small helpers ----------------------------------------------------------

/** Days between two ISO dates (b - a). */
function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Doctor registration format check.
 *  Accepts standard "STATE/NUMBER/YEAR" (e.g. KA/45678/2015) and the
 *  alternative-medicine form "AYUR/KL/2345/2019". Returns true if plausible. */
function isValidDoctorReg(reg?: string): boolean {
  if (!reg) return false;
  const standard = /^[A-Z]{2}\/\d{3,6}\/\d{4}$/;          // KA/45678/2015
  const ayush = /^[A-Z]{3,5}\/[A-Z]{2}\/\d{3,6}\/\d{4}$/; // AYUR/KL/2345/2019
  return standard.test(reg.trim()) || ayush.test(reg.trim());
}

/** Map a free-text diagnosis to a waiting-period ailment key, if any. */
function matchSpecificAilment(diagnosis = ""): string | null {
  const d = diagnosis.toLowerCase();
  const specific = policy.waiting_periods.specific_ailments as Record<string, number>;
  for (const ailment of Object.keys(specific)) {
    if (d.includes(ailment)) return ailment;
  }
  return null;
}

/** Does this diagnosis/treatment hit the policy exclusions list? */
function matchExclusion(text: string): string | null {
  const t = text.toLowerCase();
  // A few keyword rules so we catch phrasings like "weight loss" / "bariatric".
  const map: Record<string, string> = {
    "weight loss": "Weight loss treatments",
    bariatric: "Weight loss treatments",
    obesity: "Weight loss treatments",
    cosmetic: "Cosmetic procedures",
    whitening: "Cosmetic procedures",
    infertility: "Infertility treatments",
    ivf: "Infertility treatments",
    experimental: "Experimental treatments",
  };
  for (const key of Object.keys(map)) {
    if (t.includes(key)) return map[key];
  }
  return null;
}

/** Sub-limit lookup for a category, or null if the category has no sub-limit. */
function subLimitFor(category: ServiceCategory): number | null {
  const c = policy.coverage_details as any;
  switch (category) {
    case "consultation": return c.consultation_fees.sub_limit;
    case "diagnostic":   return c.diagnostic_tests.sub_limit;
    case "pharmacy":     return c.pharmacy.sub_limit;
    case "dental":       return c.dental.sub_limit;
    case "vision":       return c.vision.sub_limit;
    case "alternative_medicine": return c.alternative_medicine.sub_limit;
    default: return null;
  }
}

// ---- the engine -------------------------------------------------------------

export function adjudicate(
  claimId: string,
  extracted: ExtractedClaim,
  member: MemberContext,
  now?: string, // injectable "today" for deterministic testing; defaults to real today
): AdjudicationResult {
  const trace: RuleTrace[] = [];
  const rejections: RejectionCode[] = [];
  const flags: string[] = [];
  const rejectedItems: { description: string; reason: string }[] = [];

  const today = now ?? new Date().toISOString().slice(0, 10);
  const treatmentDate = extracted.treatment_date ?? today;
  const claimed =
    extracted.total_amount ??
    extracted.line_items.reduce((s, li) => s + li.amount, 0);

  // helper to push a trace line
  const check = (
    step: string,
    passed: boolean,
    detail: string,
    code?: RejectionCode,
    clause?: string,
  ) => {
    trace.push({ step, passed, detail, code, clause });
    if (!passed && code) rejections.push(code);
  };

  // ---------------------------------------------------------------------------
  // STEP 0: Minimum amount & submission timeline (process gates)
  // ---------------------------------------------------------------------------
  const minAmount = policy.claim_requirements.minimum_claim_amount;
  check(
    "Minimum claim amount",
    claimed >= minAmount,
    `Claimed ₹${claimed} vs minimum ₹${minAmount}`,
    "BELOW_MIN_AMOUNT",
    "claim_requirements.minimum_claim_amount",
  );

  const submissionWindow = policy.claim_requirements.submission_timeline_days;
  const ageDays = daysBetween(treatmentDate, today);
  check(
    "Submission window",
    ageDays <= submissionWindow,
    `Treatment was ${ageDays} day(s) ago; limit is ${submissionWindow} days`,
    "LATE_SUBMISSION",
    "claim_requirements.submission_timeline_days",
  );

  // ---------------------------------------------------------------------------
  // STEP 1: Eligibility — waiting periods
  // (We treat the member as covered & policy active for this assignment;
  //  those would be DB lookups in production. We DO compute waiting periods,
  //  which test case TC005 exercises.)
  // ---------------------------------------------------------------------------
  if (member.join_date) {
    const tenure = daysBetween(member.join_date, treatmentDate);

    // Initial waiting period
    check(
      "Initial waiting period",
      tenure >= policy.waiting_periods.initial_waiting,
      `Member tenure ${tenure} day(s); initial waiting ${policy.waiting_periods.initial_waiting} days`,
      "WAITING_PERIOD",
      "waiting_periods",
    );

    // Specific-ailment waiting period (diabetes/hypertension/etc.)
    const ailment = matchSpecificAilment(extracted.diagnosis);
    if (ailment) {
      const required = (policy.waiting_periods.specific_ailments as Record<string, number>)[ailment];
      const ok = tenure >= required;
      const eligibleFrom = new Date(
        new Date(member.join_date).getTime() + required * 86400000,
      ).toISOString().slice(0, 10);
      check(
        `Waiting period — ${ailment}`,
        ok,
        ok
          ? `Satisfied (${tenure}d ≥ ${required}d)`
          : `${ailment} has a ${required}-day waiting period. Eligible from ${eligibleFrom}`,
        "WAITING_PERIOD",
      "waiting_periods",
      );
    }
  } else {
    trace.push({
      step: "Waiting period",
      passed: true,
      detail: "No join date supplied; assuming tenure satisfied.",
    });
  }

  // ---------------------------------------------------------------------------
  // STEP 2: Document validation
  // ---------------------------------------------------------------------------
  check(
    "Prescription present",
    extracted.has_prescription,
    extracted.has_prescription ? "Prescription found." : "No prescription submitted.",
    "MISSING_DOCUMENTS",
    "claim_requirements.documents_required",
  );

  check(
    "Bill present",
    extracted.has_bill,
    extracted.has_bill ? "Bill found." : "No bill submitted.",
    "MISSING_DOCUMENTS",
  );

  if (extracted.has_prescription) {
    check(
      "Doctor registration valid",
      isValidDoctorReg(extracted.doctor_reg),
      extracted.doctor_reg
        ? `Reg "${extracted.doctor_reg}" ${isValidDoctorReg(extracted.doctor_reg) ? "matches" : "does not match"} expected format.`
        : "Doctor registration number missing.",
      "DOCTOR_REG_INVALID",
      "claim_requirements: doctor registration must be visible",
    );
  }

  if (extracted.document_quality === "blurry") {
    flags.push("Document image is blurry — may need manual verification.");
  }

  // ---------------------------------------------------------------------------
  // STEP 3: Coverage — exclusions (these OVERRIDE everything per priority rules)
  // A whole-claim exclusion is judged on the DIAGNOSIS / overall treatment only.
  // Individual cosmetic line items are handled per-item below (→ PARTIAL), so a
  // dental claim that merely *includes* whitening is not rejected outright.
  // ---------------------------------------------------------------------------
  // A whole-claim exclusion is judged on the DIAGNOSIS only. A procedure list
  // can legitimately mix covered + cosmetic items (e.g. root canal + whitening);
  // those are resolved per-line below into a PARTIAL approval.
  const diagnosisText = extracted.diagnosis ?? "";
  const excluded = matchExclusion(diagnosisText);
  check(
    "Policy exclusions",
    excluded === null,
    excluded ? `Matches excluded category: ${excluded}.` : "No excluded conditions detected.",
    "SERVICE_NOT_COVERED",
    "exclusions[]",
  );

  // Combined text still used for pre-auth detection below.
  const exclusionText = [
    diagnosisText,
    ...extracted.line_items.map((li) => li.description),
  ].join(" ");

  // Per-item cosmetic detection (for PARTIAL approval, e.g. teeth whitening)
  for (const li of extracted.line_items) {
    if (li.category === "cosmetic" || matchExclusion(li.description)) {
      rejectedItems.push({
        description: li.description,
        reason: "Cosmetic / excluded procedure — not covered.",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 3b: Pre-authorization (MRI/CT above threshold)
  // ---------------------------------------------------------------------------
  const PRE_AUTH_THRESHOLD = 10000;
  const needsPreAuth =
    /\b(mri|ct scan|ct\b)/i.test(exclusionText) && claimed > PRE_AUTH_THRESHOLD;
  if (needsPreAuth) {
    check(
      "Pre-authorization",
      false,
      `MRI/CT above ₹${PRE_AUTH_THRESHOLD} requires pre-authorization; none on file.`,
      "PRE_AUTH_MISSING",
      "diagnostic_tests: MRI/CT (with pre-auth)",
    );
  }

  // ---------------------------------------------------------------------------
  // STEP 4: Limits & co-pay  (only meaningful if not already hard-rejected)
  // ---------------------------------------------------------------------------
  // Compute the "eligible" base = claimed minus any per-item rejected amounts.
  const rejectedAmount = extracted.line_items
    .filter((li) => rejectedItems.some((r) => r.description === li.description))
    .reduce((s, li) => s + li.amount, 0);
  let eligible = claimed - rejectedAmount;

  // Per-claim limit.
  // Applies to the gross eligible total. EXCEPTION: claims whose covered items
  // fall under a specialty sub-limit (dental, alternative medicine, vision) are
  // governed by that sub-limit instead of the generic per-claim cap — those
  // categories exist precisely to allow larger single treatments (e.g. a root
  // canal) up to their own ceiling.
  const perClaim = policy.coverage_details.per_claim_limit;
  const specialtyCategories: ServiceCategory[] = [
    "dental", "alternative_medicine", "vision",
  ];
  const hasSpecialty = extracted.line_items.some(
    (li) =>
      specialtyCategories.includes(li.category) &&
      !rejectedItems.some((r) => r.description === li.description),
  );

  if (!hasSpecialty && eligible > perClaim) {
    check(
      "Per-claim limit",
      false,
      `Eligible ₹${eligible} exceeds per-claim limit ₹${perClaim}.`,
      "PER_CLAIM_EXCEEDED",
      "coverage_details.per_claim_limit",
    );
  } else {
    check(
      "Per-claim limit",
      true,
      hasSpecialty
        ? `Specialty claim governed by its sub-limit, not the ₹${perClaim} per-claim cap.`
        : `Eligible ₹${eligible} ≤ ₹${perClaim}.`,
    );
  }

  // Annual limit
  const annual = policy.coverage_details.annual_limit;
  const ytd = member.ytd_claimed ?? 0;
  check(
    "Annual limit",
    ytd + eligible <= annual,
    `YTD ₹${ytd} + ₹${eligible} vs annual ₹${annual}.`,
    "ANNUAL_LIMIT_EXCEEDED",
    "coverage_details.annual_limit",
  );

  // Sub-limits per category
  const byCategory = new Map<ServiceCategory, number>();
  for (const li of extracted.line_items) {
    if (rejectedItems.some((r) => r.description === li.description)) continue;
    byCategory.set(li.category, (byCategory.get(li.category) ?? 0) + li.amount);
  }
  for (const [cat, amt] of byCategory) {
    const sub = subLimitFor(cat);
    if (sub !== null) {
      const ytdCat = member.ytd_by_category?.[cat] ?? 0;
      check(
        `Sub-limit — ${cat}`,
        ytdCat + amt <= sub,
        `${cat}: YTD ₹${ytdCat} + ₹${amt} vs sub-limit ₹${sub}.`,
        "SUB_LIMIT_EXCEEDED",
        "coverage_details.<category>.sub_limit",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // STEP 5: Fraud signals → manual review
  // ---------------------------------------------------------------------------
  if ((member.previous_claims_same_day ?? 0) >= 2) {
    flags.push("Multiple claims from this member on the same day.");
  }
  const HIGH_VALUE = 25000;
  if (claimed > HIGH_VALUE) {
    flags.push(`High-value claim (> ₹${HIGH_VALUE}) — policy requires human review.`);
  }

  // ---------------------------------------------------------------------------
  // MONEY MATH — network discount OR copay, then cap.
  //   - Network hospital            → 20% network discount on eligible amount.
  //   - Non-network, no specialty   → 10% co-pay on eligible amount.
  //   - Specialty (dental/alt/vision) under sub-limit → reimbursed in full.
  // (A claim gets at most one adjustment.)
  // ---------------------------------------------------------------------------
  const copayPct = policy.coverage_details.consultation_fees.copay_percentage;     // 10
  const networkPct = policy.coverage_details.consultation_fees.network_discount;   // 20

  const isNetwork = !!(
    extracted.is_network_hospital ||
    (extracted.hospital &&
      policy.network_hospitals.some((h) =>
        extracted.hospital!.toLowerCase().includes(h.toLowerCase()),
      ))
  );

  // Cap the non-specialty portion at the per-claim limit; specialty items are
  // already governed by their sub-limit (validated above).
  let approvable = hasSpecialty ? eligible : Math.min(eligible, perClaim);

  const networkDiscount = isNetwork ? Math.round((approvable * networkPct) / 100) : 0;
  const copay =
    !isNetwork && !hasSpecialty ? Math.round((approvable * copayPct) / 100) : 0;

  let approved = approvable - copay - networkDiscount;
  if (approved < 0) approved = 0;

  // ---------------------------------------------------------------------------
  // DECISION ASSEMBLY — apply priority rules from adjudication_rules.md
  // ---------------------------------------------------------------------------
  // Priority: 1) fraud/manual review  2) exclusions/hard rejects
  //           3) partial  4) approve
  const hardReject = rejections.some((r) =>
    [
      "MISSING_DOCUMENTS",
      "DOCTOR_REG_INVALID",
      "WAITING_PERIOD",
      "waiting_periods",
      "SERVICE_NOT_COVERED",
      "PRE_AUTH_MISSING",
      "ANNUAL_LIMIT_EXCEEDED",
      "PER_CLAIM_EXCEEDED",
      "BELOW_MIN_AMOUNT",
      "LATE_SUBMISSION",
      "POLICY_INACTIVE",
      "MEMBER_NOT_COVERED",
    ].includes(r),
  );

  let decision: AdjudicationResult["decision"];
  let notes: string;
  let nextSteps: string;

  if (flags.length > 0 && (member.previous_claims_same_day ?? 0) >= 2) {
    // Fraud pattern wins (safety first).
    decision = "MANUAL_REVIEW";
    approved = 0;
    notes = "Flagged for human review: " + flags.join(" ");
    nextSteps = "A claims specialist will review this claim within 48 hours.";
  } else if (rejections.includes("PER_CLAIM_EXCEEDED")) {
    decision = "REJECTED";
    approved = 0;
    notes = `Claim amount exceeds per-claim limit of ₹${perClaim}`;
    nextSteps = "Split the claim or submit only eligible items under the limit.";
  } else if (hardReject) {
    decision = "REJECTED";
    approved = 0;
    notes = trace.filter((t) => !t.passed).map((t) => t.detail).join(" ");
    nextSteps = "Resolve the issues above and resubmit within the policy window.";
  } else if (rejectedItems.length > 0 || rejections.includes("SUB_LIMIT_EXCEEDED")) {
    decision = "PARTIAL";
    notes =
      "Some items approved, others excluded: " +
      rejectedItems.map((r) => `${r.description} (${r.reason})`).join("; ");
    nextSteps = "Approved amount will be reimbursed; excluded items are your responsibility.";
  } else if (flags.length > 0) {
    decision = "MANUAL_REVIEW";
    notes = "Flagged: " + flags.join(" ");
    nextSteps = "A claims specialist will review this claim.";
  } else {
    decision = "APPROVED";
    notes =
      (copay ? `₹${copay} co-pay applied. ` : "") +
      (networkDiscount ? `₹${networkDiscount} network discount applied. ` : "") +
      "All checks passed.";
    nextSteps = `₹${approved} will be reimbursed to your registered account in 5–7 working days.`;
  }

  // Derive a real confidence score from extraction signals + decision type,
  // rather than using a hard-coded constant. (See lib/confidence.ts.)
  const conf = scoreConfidence(extracted, decision);

  return {
    claim_id: claimId,
    decision,
    approved_amount: decision === "APPROVED" || decision === "PARTIAL" ? approved : 0,
    rejection_reasons: [...new Set(rejections)],
    flags,
    confidence_score: conf.score,
    confidence_factors: conf.factors,
    notes,
    next_steps: nextSteps,
    trace,
    breakdown: {
      claimed,
      copay,
      network_discount: networkDiscount,
      rejected_items: rejectedItems,
      approved_amount:
        decision === "APPROVED" || decision === "PARTIAL" ? approved : 0,
    },
  };
}
