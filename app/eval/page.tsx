// app/eval/page.tsx — Live batch test runner with animated pass/fail.
"use client";

import { useEffect, useState } from "react";
import Nav from "../Nav";
import type { EvalSummary, CaseResult } from "@/lib/evalRunner";

export default function EvalPage() {
  const [data, setData] = useState<EvalSummary | null>(null);
  const [revealed, setRevealed] = useState(0); // how many rows shown (for animation)
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setData(null);
    setRevealed(0);
    const res = await fetch("/api/eval");
    const json: EvalSummary = await res.json();
    setData(json);
    // Animate: reveal one case at a time.
    for (let i = 1; i <= json.results.length; i++) {
      await new Promise((r) => setTimeout(r, 220));
      setRevealed(i);
    }
    setRunning(false);
  }

  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);

  const shown = data?.results.slice(0, revealed) ?? [];
  const passSoFar = shown.filter((r) => r.passed).length;
  const liveAcc = shown.length ? Math.round((passSoFar / shown.length) * 100) : 0;

  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 80 }}>
        <div className="row">
          <div>
            <div className="eyebrow">Evaluation harness</div>
            <h1 style={{ fontSize: 38, marginTop: 8 }}>Live test suite</h1>
          </div>
          <button className="btn" onClick={run} disabled={running}>
            {running && <span className="spinner" />}{running ? "Running…" : "▶ Run all tests"}
          </button>
        </div>
        <p className="mt12 soft" style={{ fontSize: 16, maxWidth: 640 }}>
          Every official test case adjudicated through the deterministic engine and
          scored against its expected output — decision, amount, and rejection reason.
          Runs in milliseconds, no API calls, fully reproducible.
        </p>

        <div className="grid3 mt24">
          <Metric label="Cases run" value={`${shown.length}/${data?.total ?? 10}`} />
          <Metric label="Passing" value={`${passSoFar}`} tone="green" />
          <Metric label="Accuracy" value={`${liveAcc}%`} tone={liveAcc === 100 ? "green" : "amber"} />
        </div>

        <div className="card mt24" style={{ padding: 0, overflow: "hidden" }}>
          <table>
            <thead>
              <tr><th>Case</th><th>Expected</th><th>Actual</th><th>Amount</th><th style={{textAlign:"right"}}>Result</th></tr>
            </thead>
            <tbody className="stagger">
              {shown.map((r) => <Row key={r.case_id} r={r} />)}
            </tbody>
          </table>
          {shown.length === 0 && <p className="soft tiny" style={{ padding: 20 }}>Running tests…</p>}
        </div>

        {!running && data && liveAcc === 100 && (
          <div className="card mt24 fade-in" style={{ background: "var(--green-bg)", borderColor: "#bfe3cd" }}>
            <strong style={{ color: "var(--green)" }}>✓ All {data.total} cases pass</strong>
            <span className="soft tiny"> — decision, approved amount, and rejection reasons all match expected output.</span>
          </div>
        )}
      </main>
    </>
  );
}

function Row({ r }: { r: CaseResult }) {
  return (
    <tr>
      <td>
        <div className="mono tiny" style={{ fontWeight: 600 }}>{r.case_id}</div>
        <div className="tiny muted">{r.case_name}</div>
      </td>
      <td><span className={`pill ${r.expected_decision}`}>{r.expected_decision.replace("_", " ")}</span></td>
      <td><span className={`pill ${r.actual_decision}`}>{r.actual_decision.replace("_", " ")}</span></td>
      <td className="mono tiny soft">{r.expected_amount ?? "—"} → {r.actual_amount}</td>
      <td style={{ textAlign: "right" }}>
        {r.passed
          ? <span style={{ color: "var(--green)", fontWeight: 600 }}>✓ pass</span>
          : <span style={{ color: "var(--red)", fontWeight: 600 }}>✕ fail</span>}
      </td>
    </tr>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "green" | "amber" }) {
  const color = tone === "green" ? "var(--green)" : tone === "amber" ? "var(--amber)" : "var(--ink)";
  return (
    <div className="metric">
      <div className="tiny muted">{label}</div>
      <div className="num" style={{ color }}>{value}</div>
    </div>
  );
}
