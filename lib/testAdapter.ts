// lib/testAdapter.ts
// -----------------------------------------------------------------------------
// The provided test_cases.json uses a nested "documents" shape that's convenient
// for humans. The rule engine wants a flat ExtractedClaim + MemberContext.
// This adapter bridges the two WITHOUT calling the LLM — so the eval harness
// tests the DETERMINISTIC engine in isolation (fast, free, 100% reproducible).
//
// (The full pipeline with real vision extraction is tested via the UI/API.)
// -----------------------------------------------------------------------------

import type {
  ExtractedClaim,
  MemberContext,
  LineItem,
  ServiceCategory,
} from "@/types";

interface RawCase {
  case_id: string;
  case_name: string;
  description: string;
  input_data: any;
  expected_output: any;
}

function categorise(key: string, desc: string): ServiceCategory {
  const s = (key + " " + desc).toLowerCase();
  if (/(whitening|cosmetic)/.test(s)) return "cosmetic";
  if (/(consult)/.test(s)) return "consultation";
  if (/(mri|ct|x-?ray|blood|cbc|dengue|test|scan|diagnostic|ecg|ultrasound)/.test(s)) return "diagnostic";
  if (/(medicine|pharma|drug|tab|syp)/.test(s)) return "pharmacy";
  if (/(root_?canal|dental|tooth|filling|extraction)/.test(s)) return "dental";
  if (/(therapy|panchakarma|ayur|homeo)/.test(s)) return "alternative_medicine";
  if (/(diet|plan)/.test(s)) return "other";
  return "procedure";
}

export function adaptCase(rc: RawCase): {
  extracted: ExtractedClaim;
  member: MemberContext;
} {
  const d = rc.input_data;
  const docs = d.documents ?? {};
  const presc = docs.prescription;
  const bill = docs.bill ?? {};

  // Build line items from whatever keys the bill has.
  // Skip non-numeric values (e.g. "test_names": [...] is metadata, not a charge).
  const line_items: LineItem[] = Object.entries(bill)
    .filter(([, v]) => typeof v === "number" && !Number.isNaN(Number(v)))
    .map(([k, v]) => ({
      description: k.replace(/_/g, " "),
      amount: Number(v),
      category: categorise(k, presc?.diagnosis ?? ""),
    }));

  const extracted: ExtractedClaim = {
    member_name: d.member_name,
    treatment_date: d.treatment_date,
    doctor_name: presc?.doctor_name,
    doctor_reg: presc?.doctor_reg,
    diagnosis: presc?.diagnosis ?? (presc?.treatment as string | undefined),
    medicines: presc?.medicines_prescribed ?? [],
    procedures: presc?.procedures ?? (presc?.treatment ? [presc.treatment] : []),
    tests: presc?.tests_prescribed ?? [],
    line_items,
    total_amount: d.claim_amount,
    hospital: d.hospital,
    is_network_hospital: d.hospital
      ? ["apollo", "fortis", "max", "manipal", "narayana"].some((h) =>
          d.hospital.toLowerCase().includes(h),
        )
      : undefined,
    document_quality: "clear",
    has_prescription: !!presc,
    has_bill: Object.keys(bill).length > 0,
    extraction_notes: "Adapted from test_cases.json (no vision step).",
  };

  const member: MemberContext = {
    member_id: d.member_id,
    member_name: d.member_name,
    join_date: d.member_join_date,
    ytd_claimed: 0,
    previous_claims_same_day: d.previous_claims_same_day ?? 0,
    cashless_request: d.cashless_request ?? false,
  };

  return { extracted, member };
}
