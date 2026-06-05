// scripts/seedDb.ts
// Run with: npm run seed
// Populates the store with the 10 test cases as real claim records, so the app
// has browsable history immediately. Works with MongoDB if MONGODB_URI is set,
// otherwise no-ops gracefully (in-memory store doesn't persist across processes).

import { adjudicate } from "../lib/ruleEngine";
import { adaptCase } from "../lib/testAdapter";
import { saveClaim } from "../lib/db";
import testData from "../data/test_cases.json";
import type { ClaimRecord } from "../types";

async function main() {
  if (!process.env.MONGODB_URI) {
    console.log(
      "No MONGODB_URI set — the app uses an in-memory store that can't be " +
        "seeded from a separate process. Just submit a claim in the UI instead.",
    );
    return;
  }

  const cases = (testData as any).test_cases as any[];
  let n = 0;
  for (const rc of cases) {
    const { extracted, member } = adaptCase(rc);
    const treat = extracted.treatment_date ?? "2024-11-01";
    const today = new Date(new Date(treat).getTime() + 5 * 86400000)
      .toISOString()
      .slice(0, 10);
    const result = adjudicate(rc.case_id, extracted, member, today);

    const record: ClaimRecord = {
      claim_id: rc.case_id,
      created_at: new Date().toISOString(),
      member,
      extracted,
      result,
      status: result.decision,
    };
    await saveClaim(record);
    n++;
  }
  console.log(`Seeded ${n} claim records.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
