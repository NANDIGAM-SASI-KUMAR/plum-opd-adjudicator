// lib/evalRunner.ts
// -----------------------------------------------------------------------------
// Runs every case in test_cases.json through the DETERMINISTIC engine and
// scores the result against expected_output. Used by both the CLI (npm run eval)
// and the /eval dashboard. This is your "evaluation metrics for AI accuracy"
// bonus — made concrete.
// -----------------------------------------------------------------------------

import { adjudicate } from "@/lib/ruleEngine";
import { adaptCase } from "@/lib/testAdapter";
import testData from "@/data/test_cases.json";

export interface CaseResult {
  case_id: string;
  case_name: string;
  expected_decision: string;
  actual_decision: string;
  decision_match: boolean;
  expected_amount?: number;
  actual_amount: number;
  amount_match: boolean;
  expected_reasons?: string[];
  actual_reasons: string[];
  reason_match: boolean;
  passed: boolean;
  notes: string;
}

export interface EvalSummary {
  total: number;
  passed: number;
  accuracy: number;
  decision_accuracy: number;
  results: CaseResult[];
}

export function runEval(): EvalSummary {
  const cases = (testData as any).test_cases as any[];
  const results: CaseResult[] = [];

  for (const rc of cases) {
    const { extracted, member } = adaptCase(rc);
    // Anchor "today" to a few days after the treatment date so the 30-day
    // submission window is satisfied for these historical fixtures.
    const treat = extracted.treatment_date ?? "2024-11-01";
    const anchoredToday = new Date(new Date(treat).getTime() + 5 * 86400000)
      .toISOString()
      .slice(0, 10);
    const out = adjudicate(rc.case_id, extracted, member, anchoredToday);
    const exp = rc.expected_output;

    const decision_match = out.decision === exp.decision;

    // Amount: only compare when an amount is expected.
    const expAmount = exp.approved_amount;
    const amount_match =
      expAmount === undefined ? true : out.approved_amount === expAmount;

    // Reasons: at least one expected rejection reason should appear.
    const expReasons: string[] = exp.rejection_reasons ?? [];
    const reason_match =
      expReasons.length === 0
        ? true
        : expReasons.every((r) => out.rejection_reasons.includes(r as any));

    const passed = decision_match && amount_match && reason_match;

    results.push({
      case_id: rc.case_id,
      case_name: rc.case_name,
      expected_decision: exp.decision,
      actual_decision: out.decision,
      decision_match,
      expected_amount: expAmount,
      actual_amount: out.approved_amount,
      amount_match,
      expected_reasons: expReasons,
      actual_reasons: out.rejection_reasons,
      reason_match,
      passed,
      notes: out.notes,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const decisionCount = results.filter((r) => r.decision_match).length;

  return {
    total: results.length,
    passed: passedCount,
    accuracy: +(passedCount / results.length).toFixed(3),
    decision_accuracy: +(decisionCount / results.length).toFixed(3),
    results,
  };
}
