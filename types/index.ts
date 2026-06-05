// types/index.ts
// -----------------------------------------------------------------------------
// One place that defines the "shape" of every object in the system.
// In TypeScript, an `interface` is a contract: if an object claims to be a
// `Claim`, the compiler guarantees it has exactly these fields. This is the
// single biggest reason TypeScript catches bugs that plain JavaScript ships.
// -----------------------------------------------------------------------------

/** The four possible outcomes of adjudication. A `type` union means a value
 *  can ONLY be one of these exact strings — a typo like "APROVED" won't compile. */
export type Decision = "APPROVED" | "REJECTED" | "PARTIAL" | "MANUAL_REVIEW";

/** Machine-readable rejection codes, taken straight from adjudication_rules.md.
 *  Using codes (not free text) means the UI, the DB, and the eval harness all
 *  agree on the same vocabulary. */
export type RejectionCode =
  | "POLICY_INACTIVE"
  | "WAITING_PERIOD"
  | "MEMBER_NOT_COVERED"
  | "MISSING_DOCUMENTS"
  | "ILLEGIBLE_DOCUMENTS"
  | "INVALID_PRESCRIPTION"
  | "DOCTOR_REG_INVALID"
  | "DATE_MISMATCH"
  | "PATIENT_MISMATCH"
  | "SERVICE_NOT_COVERED"
  | "EXCLUDED_CONDITION"
  | "PRE_AUTH_MISSING"
  | "ANNUAL_LIMIT_EXCEEDED"
  | "SUB_LIMIT_EXCEEDED"
  | "PER_CLAIM_EXCEEDED"
  | "NOT_MEDICALLY_NECESSARY"
  | "EXPERIMENTAL_TREATMENT"
  | "COSMETIC_PROCEDURE"
  | "LATE_SUBMISSION"
  | "DUPLICATE_CLAIM"
  | "BELOW_MIN_AMOUNT";

/** A single line item on a bill, e.g. "Consultation Fee — ₹1000".
 *  `category` lets the rule engine apply the right sub-limit. */
export interface LineItem {
  description: string;
  amount: number;
  category: ServiceCategory;
}

/** Buckets that map to sub-limits in policy_terms.json. */
export type ServiceCategory =
  | "consultation"
  | "diagnostic"
  | "pharmacy"
  | "dental"
  | "vision"
  | "alternative_medicine"
  | "procedure"
  | "cosmetic"
  | "other";

/** Everything the EXTRACTION agent pulls out of the uploaded documents.
 *  The `?` means "optional" — real documents are messy and a field may be
 *  missing. The rule engine treats missing fields as failures where required. */
export interface ExtractedClaim {
  member_name?: string;
  treatment_date?: string; // ISO YYYY-MM-DD
  doctor_name?: string;
  doctor_reg?: string;
  diagnosis?: string;
  medicines?: string[];
  procedures?: string[];
  tests?: string[];
  line_items: LineItem[];
  total_amount?: number;
  hospital?: string;
  is_network_hospital?: boolean;
  document_quality?: "clear" | "blurry" | "partial";
  has_prescription: boolean;
  has_bill: boolean;
  // The model's own note on anything ambiguous it saw — great for the audit trail.
  extraction_notes?: string;
}

/** Member context the system knows from policy records (not from the document). */
export interface MemberContext {
  member_id: string;
  member_name: string;
  join_date?: string;       // ISO date — used for waiting-period maths
  ytd_claimed?: number;     // rupees already claimed this year
  ytd_by_category?: Partial<Record<ServiceCategory, number>>;
  previous_claims_same_day?: number;
  cashless_request?: boolean;
}

/** One line of the audit trail. Every rule that runs records WHAT it checked,
 *  WHETHER it passed, and WHY. This is the "explainability" the interviewer
 *  will ask about. */
export interface RuleTrace {
  step: string;          // e.g. "Per-claim limit"
  passed: boolean;
  detail: string;        // human-readable explanation
  code?: RejectionCode;  // set only when this rule causes a rejection/flag
  clause?: string;       // the policy clause this check enforces (explainability)
}

/** The final, complete decision object — matches the format in
 *  adjudication_rules.md exactly, plus extra fields for the UI. */
export interface AdjudicationResult {
  claim_id: string;
  decision: Decision;
  approved_amount: number;
  rejection_reasons: RejectionCode[];
  flags: string[];                 // fraud / review flags
  confidence_score: number;        // 0..1
  notes: string;
  next_steps: string;
  trace: RuleTrace[];              // the full audit trail
  llm_reasoning?: string;          // Opus's plain-English summary
  confidence_factors?: {           // transparent breakdown of the confidence score
    label: string;
    weight: number;
    score: number;
    detail: string;
  }[];
  breakdown: {
    claimed: number;
    copay: number;
    network_discount: number;
    rejected_items: { description: string; reason: string }[];
    approved_amount: number;
  };
}

/** A stored claim record (what goes in MongoDB). */
export interface ClaimRecord {
  claim_id: string;
  created_at: string;
  member: MemberContext;
  extracted: ExtractedClaim;
  result: AdjudicationResult;
  status: Decision;
  appeal?: {
    requested_at: string;
    reason: string;
    resolved?: boolean;
    resolution?: string;
  };
}
