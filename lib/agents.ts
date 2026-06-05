// lib/agents.ts
// -----------------------------------------------------------------------------
// The LLM-powered agents. Two roles, deliberately narrow:
//
//   1) extractClaim()  — PERCEPTION. Reads images/PDFs/text → structured JSON.
//   2) explainDecision() — NARRATION. Explains the already-final decision.
//
// Both go through the provider-agnostic llmClient, so they run on free local
// Ollama by default, Claude in production, or a built-in parser in demo mode.
// -----------------------------------------------------------------------------

import {
  llmComplete,
  parseJsonLoose,
  getProvider,
  type DocInput,
} from "@/lib/llmClient";
import type { AdjudicationResult, ExtractedClaim, LineItem, ServiceCategory } from "@/types";

export type { DocInput };

const EXTRACTION_SCHEMA_PROMPT = `
You are a meticulous medical-document data-extraction engine for an OPD
insurance system. Read the attached document(s) — prescription, hospital/clinic
bill, pharmacy bill, or diagnostic report. They may be blurry, photographed at
an angle, handwritten, or partly in a regional language.

Return ONLY a JSON object (no prose, no code fences) with this exact shape:

{
  "member_name": string | null,
  "treatment_date": "YYYY-MM-DD" | null,
  "doctor_name": string | null,
  "doctor_reg": string | null,
  "diagnosis": string | null,
  "medicines": string[],
  "procedures": string[],
  "tests": string[],
  "line_items": [
    { "description": string, "amount": number, "category":
      "consultation"|"diagnostic"|"pharmacy"|"dental"|"vision"|
      "alternative_medicine"|"procedure"|"cosmetic"|"other" }
  ],
  "total_amount": number | null,
  "hospital": string | null,
  "document_quality": "clear" | "blurry" | "partial",
  "has_prescription": boolean,
  "has_bill": boolean,
  "extraction_notes": string
}

Rules:
- Cosmetic items (teeth/skin whitening) → "cosmetic". Lab tests/scans → "diagnostic".
  Doctor visits → "consultation". Medicines → "pharmacy".
- If a number is unreadable, estimate and note it; never invent precision.
- Use null for fields you cannot find, [] for empty lists.
- Output JSON ONLY.
`.trim();

function normalise(parsed: Partial<ExtractedClaim>): ExtractedClaim {
  return {
    member_name: parsed.member_name ?? undefined,
    treatment_date: parsed.treatment_date ?? undefined,
    doctor_name: parsed.doctor_name ?? undefined,
    doctor_reg: parsed.doctor_reg ?? undefined,
    diagnosis: parsed.diagnosis ?? undefined,
    medicines: parsed.medicines ?? [],
    procedures: parsed.procedures ?? [],
    tests: parsed.tests ?? [],
    line_items: parsed.line_items ?? [],
    total_amount: parsed.total_amount ?? undefined,
    hospital: parsed.hospital ?? undefined,
    is_network_hospital: undefined,
    document_quality: parsed.document_quality ?? "clear",
    has_prescription: parsed.has_prescription ?? false,
    has_bill: parsed.has_bill ?? false,
    extraction_notes: parsed.extraction_notes ?? "",
  };
}

/** EXTRACTION AGENT — vision + text → structured ExtractedClaim. */
export async function extractClaim(
  docs: DocInput[],
  fallbackText?: string,
): Promise<ExtractedClaim> {
  // DEMO mode: no LLM. Parse typed text with a small rule-based parser so the
  // app runs with zero setup. (Images aren't supported in demo mode.)
  if (getProvider() === "demo") {
    return demoExtract(fallbackText ?? "");
  }

  const prompt =
    EXTRACTION_SCHEMA_PROMPT +
    (fallbackText ? `\n\nAdditional typed details:\n${fallbackText}` : "");

  const raw = await llmComplete({
    role: "EXTRACTOR",
    prompt,
    images: docs,
    maxTokens: 1500,
  });

  try {
    return normalise(parseJsonLoose<Partial<ExtractedClaim>>(raw));
  } catch {
    // If a local model returns malformed JSON, fall back to the text parser
    // on the typed details rather than crashing the whole claim.
    if (fallbackText) return demoExtract(fallbackText);
    throw new Error("Could not parse extraction output as JSON.");
  }
}

/** REASONING AGENT — explains the FINAL decision in plain English. */
export async function explainDecision(
  result: AdjudicationResult,
  extracted: ExtractedClaim,
): Promise<string> {
  if (getProvider() === "demo") {
    return result.notes; // deterministic notes are a fine explanation in demo mode
  }

  const prompt = `
You are a friendly insurance claims assistant. A deterministic rule engine has
ALREADY made the final, binding decision below. Explain it to the member in
2-4 warm, clear sentences. Do NOT change, dispute, or recompute any number.

Decision: ${result.decision}
Approved amount: ₹${result.approved_amount}
Notes: ${result.notes}
Rejection codes: ${result.rejection_reasons.join(", ") || "none"}
Diagnosis: ${extracted.diagnosis ?? "n/a"}

Write the explanation now (plain text):
`.trim();

  try {
    const out = await llmComplete({ role: "REASONER", prompt, maxTokens: 400 });
    return out.trim() || result.notes;
  } catch {
    return result.notes;
  }
}

// ---------------------------------------------------------------------------
// DEMO-MODE PARSER — no LLM. Pulls fields out of typed text with regex.
// Good enough to demonstrate the full pipeline offline; the real extractor
// (Ollama/Claude) handles actual document images.
// ---------------------------------------------------------------------------
function demoExtract(text: string): ExtractedClaim {
  const t = text;
  const lower = t.toLowerCase();

  // doctor reg like KA/45678/2015 or AYUR/KL/2345/2019
  const reg = t.match(/\b([A-Z]{2,5}\/(?:[A-Z]{2}\/)?\d{3,6}\/\d{4})\b/)?.[1];
  // doctor name after "Dr." or "Vaidya"
  const doc = t.match(/\b(?:Dr\.?|Vaidya)\s+([A-Z][a-zA-Z]+)/)?.[0];
  // date YYYY-MM-DD or DD/MM/YYYY
  let date = t.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  if (!date) {
    const dm = t.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (dm) date = `${dm[3]}-${dm[2]}-${dm[1]}`;
  }

  // line items: capture "<label> ... ₹<amount>" or "<label> <amount>"
  const items: LineItem[] = [];
  const re = /([A-Za-z][A-Za-z \-]{2,40}?)\s*[:=]?\s*(?:₹|rs\.?|inr)?\s*(\d{2,7})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const label = m[1].trim();
    const amount = Number(m[2]);
    if (amount < 50 || amount > 1_000_000) continue; // skip noise
    if (amount >= 1900 && amount <= 2100) continue;   // skip years
    if (/\b(reg|date|age|year|dob|born)\b/i.test(label)) continue;
    items.push({ description: label, amount, category: demoCategorise(label, lower) });
  }

  // Diagnosis: capture text after "diagnosis:" but STOP at the next field/number.
  let diagnosis: string | undefined;
  const dm = t.match(/diagnos\w*\s*[:\-]?\s*([A-Za-z][A-Za-z ]{2,40}?)(?=\s*[,.;]|\s+\d|\s+consult|\s+treatment|$)/i);
  if (dm) diagnosis = dm[1].trim();
  if (!diagnosis) {
    diagnosis = t
      .match(/(?:for|with)\s+([a-z][a-z ]{3,30}(?:fever|pain|infection|diabetes|decay))/i)?.[1]
      ?.trim();
  }

  const total = items.reduce((s, li) => s + li.amount, 0);

  return normalise({
    doctor_name: doc,
    doctor_reg: reg,
    treatment_date: date,
    diagnosis,
    line_items: items,
    total_amount: total || undefined,
    has_prescription: !!(reg || doc || diagnosis),
    has_bill: items.length > 0,
    document_quality: "clear",
    extraction_notes:
      "Parsed from typed text in demo mode (no LLM). Upload images with Ollama/Claude for real OCR.",
  });
}

function demoCategorise(label: string, ctx: string): ServiceCategory {
  const s = (label + " " + ctx).toLowerCase();
  if (/whiten|cosmetic/.test(s)) return "cosmetic";
  if (/consult/.test(s)) return "consultation";
  if (/mri|ct|x-?ray|blood|cbc|dengue|test|scan|ecg|ultrasound|diagnos/.test(s)) return "diagnostic";
  if (/medicine|pharma|drug|tab|syrup|syp/.test(s)) return "pharmacy";
  if (/root|canal|dental|tooth|filling|extraction/.test(s)) return "dental";
  if (/therapy|panchakarma|ayur|homeo/.test(s)) return "alternative_medicine";
  return "procedure";
}
