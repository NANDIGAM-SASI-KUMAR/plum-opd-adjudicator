// scripts/runEval.ts
// Run with: npm run eval
// Prints a coloured pass/fail table for all test cases. Pure deterministic —
// no API key needed, runs in milliseconds.

import { runEval } from "../lib/evalRunner";

const summary = runEval();

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

console.log(`\n${BOLD}OPD Claim Adjudicator — Evaluation${RESET}\n`);
console.log(
  "ID      Decision (exp → act)        Amt(exp→act)      Reasons   Result",
);
console.log("─".repeat(78));

for (const r of summary.results) {
  const dec = `${r.expected_decision} → ${r.actual_decision}`.padEnd(26);
  const amt = `${r.expected_amount ?? "-"}→${r.actual_amount}`.padEnd(16);
  const reason = (r.reason_match ? "ok" : "MISS").padEnd(8);
  const mark = r.passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  const colour = r.passed ? "" : RED;
  console.log(`${colour}${r.case_id.padEnd(7)}${RESET} ${dec} ${amt} ${reason} ${mark}`);
  if (!r.passed) {
    console.log(`${DIM}        ↳ ${r.notes}${RESET}`);
  }
}

console.log("─".repeat(78));
console.log(
  `\n${BOLD}Decision accuracy:${RESET} ${(summary.decision_accuracy * 100).toFixed(0)}%   ` +
    `${BOLD}Full match (decision+amount+reasons):${RESET} ${(summary.accuracy * 100).toFixed(0)}%   ` +
    `(${summary.passed}/${summary.total})\n`,
);
