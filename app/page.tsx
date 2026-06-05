// app/page.tsx
"use client";

import { useState, useEffect } from "react";
import Nav from "./Nav";
import type { AdjudicationResult, ExtractedClaim } from "@/types";

function fileToDoc(file: File): Promise<{ media_type: string; data: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ media_type: file.type, data: (reader.result as string).split(",")[1] });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Quick-fill samples so a reviewer can try the system in one click.
const SAMPLES: { label: string; text: string; member: any }[] = [
  {
    label: "Viral fever (→ Approved)",
    text: "City Care Clinic. Dr. Sharma KA/45678/2015. Date 2024-11-01. Diagnosis: Viral fever. Consultation Fee 1000, CBC Blood Test 500.",
    member: { member_id: "EMP001", member_name: "Rajesh Kumar" },
  },
  {
    label: "Root canal + whitening (→ Partial)",
    text: "SmileWell Dental. Dr. Patel MH/23456/2018. Date 2024-11-01. Diagnosis: Tooth decay requiring root canal. Root Canal Treatment 8000, Teeth Whitening 4000.",
    member: { member_id: "EMP002", member_name: "Priya Singh" },
  },
  {
    label: "Over limit (→ Rejected)",
    text: "Wellness Center. Dr. Gupta DL/34567/2016. Date 2024-11-01. Diagnosis: Gastroenteritis. Consultation Fee 2000, Medicines 5500.",
    member: { member_id: "EMP003", member_name: "Amit Verma" },
  },
  {
    label: "Network hospital (→ Discount)",
    text: "Apollo Hospitals. Dr. Iyer TN/56789/2013. Date 2024-11-01. Diagnosis: Acute bronchitis. Consultation Fee 1500, Medicines 3000.",
    member: { member_id: "EMP010", member_name: "Deepak Shah" },
  },
];

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [memberId, setMemberId] = useState("EMP001");
  const [memberName, setMemberName] = useState("Rajesh Kumar");
  const [joinDate, setJoinDate] = useState("");
  const [ytd, setYtd] = useState("0");
  const [sameDay, setSameDay] = useState("0");

  const [stage, setStage] = useState<"idle" | "extracting" | "adjudicating">("idle");
  const [extracted, setExtracted] = useState<ExtractedClaim | null>(null);
  const [result, setResult] = useState<AdjudicationResult | null>(null);
  const [error, setError] = useState("");

  // Pick up a document sent over from the generator page.
  useEffect(() => {
    const prefill = typeof window !== "undefined" ? sessionStorage.getItem("plum_prefill") : null;
    if (prefill) {
      setText(prefill);
      sessionStorage.removeItem("plum_prefill");
    }
  }, []);

  function loadSample(s: typeof SAMPLES[number]) {
    setText(s.text);
    setMemberId(s.member.member_id);
    setMemberName(s.member.member_name);
    setFiles([]);
    setResult(null);
    setExtracted(null);
    setError("");
  }

  async function handleRun() {
    setError(""); setResult(null); setExtracted(null);
    try {
      setStage("extracting");
      const docs = await Promise.all(files.map(fileToDoc));
      const exRes = await fetch("/api/extract", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docs, text }),
      });
      const exJson = await exRes.json();
      if (!exRes.ok) throw new Error(exJson.error);
      setExtracted(exJson.extracted);

      setStage("adjudicating");
      const adjRes = await fetch("/api/adjudicate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extracted: exJson.extracted,
          member: {
            member_id: memberId, member_name: memberName,
            join_date: joinDate || undefined,
            ytd_claimed: Number(ytd) || 0,
            previous_claims_same_day: Number(sameDay) || 0,
          },
          explain: true,
        }),
      });
      const adjJson = await adjRes.json();
      if (!adjRes.ok) throw new Error(adjJson.error);
      setResult(adjJson.result);
    } catch (e: any) {
      setError(e.message ?? "Something went wrong.");
    } finally { setStage("idle"); }
  }

  const busy = stage !== "idle";

  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 80 }}>
        <div className="eyebrow">Claim intake</div>
        <h1 style={{ fontSize: 40, marginTop: 8, maxWidth: 640 }}>Adjudicate an OPD claim</h1>
        <p className="mt12 soft" style={{ fontSize: 17, maxWidth: 600 }}>
          AI reads the prescription and bill; a deterministic rule engine makes the
          decision. Every approved rupee traces to a specific policy clause.
        </p>

        {/* quick samples */}
        <div className="mt24" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="tiny soft" style={{ alignSelf: "center", marginRight: 4 }}>Try a sample:</span>
          {SAMPLES.map((s) => (
            <button key={s.label} className="btn ghost sm" onClick={() => loadSample(s)}>{s.label}</button>
          ))}
        </div>

        <div className="grid2 mt24" style={{ alignItems: "start", gap: 24 }}>
          {/* LEFT */}
          <div className="card card-pad-lg">
            <h3 style={{ fontSize: 18 }}>1 · Documents</h3>
            <div className="field mt16">
              <label>Upload prescription / bill (image or PDF)</label>
              <input type="file" multiple accept="image/*,application/pdf"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
              {files.length > 0 && <p className="tiny soft mt8">{files.length} file(s): {files.map((f) => f.name).join(", ")}</p>}
            </div>
            <div className="field">
              <label>…or paste claim details as text</label>
              <textarea rows={4} placeholder="Dr. Sharma KA/45678/2015, Viral fever, consultation 1000, CBC 500…"
                value={text} onChange={(e) => setText(e.target.value)} />
            </div>

            <h3 className="mt24" style={{ fontSize: 18 }}>2 · Member</h3>
            <div className="grid2 mt16">
              <div className="field"><label>Member ID</label><input value={memberId} onChange={(e) => setMemberId(e.target.value)} /></div>
              <div className="field"><label>Member name</label><input value={memberName} onChange={(e) => setMemberName(e.target.value)} /></div>
              <div className="field"><label>Join date (waiting periods)</label><input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} /></div>
              <div className="field"><label>Claimed YTD (₹)</label><input value={ytd} onChange={(e) => setYtd(e.target.value)} /></div>
              <div className="field"><label>Claims same day</label><input value={sameDay} onChange={(e) => setSameDay(e.target.value)} /></div>
            </div>

            <button className="btn block mt8" onClick={handleRun} disabled={busy}>
              {busy && <span className="spinner" />}
              {stage === "extracting" ? "Reading documents…" : stage === "adjudicating" ? "Adjudicating…" : "Run adjudication"}
            </button>
            {error && <p className="mt16" style={{ color: "var(--red)" }}>{error}</p>}
          </div>

          {/* RIGHT */}
          <div>
            {!extracted && !result && (
              <div className="card card-pad-lg" style={{ textAlign: "center", padding: 52 }}>
                <div style={{ fontSize: 30 }}>🩺</div>
                <h3 className="mt12" style={{ fontSize: 19, color: "var(--teal-deep)" }}>Decision appears here</h3>
                <p className="tiny soft mt8">You'll see what the AI extracted, the full audit trail with policy clauses, and the final decision with confidence.</p>
              </div>
            )}
            {extracted && <ExtractionCard ex={extracted} />}
            {result && <DecisionCard result={result} />}
          </div>
        </div>
      </main>
    </>
  );
}

function ExtractionCard({ ex }: { ex: ExtractedClaim }) {
  const total = ex.total_amount ?? ex.line_items.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="card fade-in">
      <div className="eyebrow">AI extraction</div>
      <h3 className="mt4" style={{ fontSize: 16 }}>What the AI read</h3>
      <div className="tiny mt16 stack" style={{ gap: 7 }}>
        <div className="row"><span className="muted">Diagnosis</span><span className="soft">{ex.diagnosis ?? "—"}</span></div>
        <div className="row"><span className="muted">Doctor</span><span className="soft">{ex.doctor_name ?? "—"} · {ex.doctor_reg ?? "no reg"}</span></div>
        <div className="row"><span className="muted">Date</span><span className="soft">{ex.treatment_date ?? "—"}</span></div>
        {ex.line_items.map((li, i) => (
          <div className="row" key={i} style={{ paddingLeft: 10 }}>
            <span className="muted">· {li.description} <span className="mono" style={{ fontSize: 10, opacity: .7 }}>{li.category}</span></span>
            <span className="mono soft">₹{li.amount}</span>
          </div>
        ))}
        <div className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 7, marginTop: 2 }}>
          <span style={{ fontWeight: 600 }}>Total read</span><span className="mono" style={{ fontWeight: 600 }}>₹{total}</span>
        </div>
      </div>
      {ex.extraction_notes && <p className="tiny muted mt12"><em>{ex.extraction_notes}</em></p>}
    </div>
  );
}

function DecisionCard({ result }: { result: AdjudicationResult }) {
  const pct = Math.round(result.confidence_score * 100);
  return (
    <div className="card card-pad-lg fade-in mt16">
      <div className="row">
        <span className={`pill ${result.decision}`}><span className="dotmark" />{result.decision.replace("_", " ")}</span>
        <span className="tiny mono muted">{result.claim_id}</span>
      </div>

      <div className="mt16" style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "Fraunces", fontSize: 42, fontWeight: 600 }}>₹{result.approved_amount.toLocaleString("en-IN")}</span>
        <span className="muted">approved</span>
      </div>

      <div className="tiny mt12 stack" style={{ gap: 5 }}>
        <div className="row"><span className="muted">Claimed</span><span className="mono soft">₹{result.breakdown.claimed}</span></div>
        {result.breakdown.copay > 0 && <div className="row"><span className="muted">Co-pay (10%)</span><span className="mono" style={{ color: "var(--red)" }}>−₹{result.breakdown.copay}</span></div>}
        {result.breakdown.network_discount > 0 && <div className="row"><span className="muted">Network discount (20%)</span><span className="mono" style={{ color: "var(--red)" }}>−₹{result.breakdown.network_discount}</span></div>}
        {result.breakdown.rejected_items.map((r, i) => (
          <div className="row" key={i}><span className="muted">✕ {r.description}</span><span className="tiny" style={{ color: "var(--red)" }}>{r.reason}</span></div>
        ))}
      </div>

      <div className="mt16" style={{ background: "var(--teal-tint)", borderRadius: 10, padding: "12px 14px" }}>
        <div className="row"><span className="tiny muted">Confidence</span><span className="mono tiny" style={{ fontWeight: 600 }}>{pct}%</span></div>
        <div className="progress mt8"><div style={{ width: `${pct}%` }} /></div>
        {result.confidence_factors && result.confidence_factors.length > 0 && (
          <details className="mt12">
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--teal-deep)", fontWeight: 600 }}>How is this computed?</summary>
            <div className="mt8 stack" style={{ gap: 6 }}>
              {result.confidence_factors.map((f, i) => (
                <div key={i} className="tiny">
                  <div className="row">
                    <span className="soft">{f.label} <span className="muted">· {Math.round(f.weight * 100)}% weight</span></span>
                    <span className="mono" style={{ color: f.score >= 0.8 ? "var(--green)" : f.score >= 0.5 ? "var(--amber)" : "var(--red)" }}>{Math.round(f.score * 100)}%</span>
                  </div>
                  <div className="muted" style={{ fontSize: 11 }}>{f.detail}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {result.llm_reasoning && (
        <p className="mt16" style={{ fontSize: 15, fontStyle: "italic", color: "var(--ink-soft)", borderLeft: "3px solid var(--teal-bg)", paddingLeft: 12 }}>
          {result.llm_reasoning}
        </p>
      )}

      <p className="tiny mt16"><strong>Next steps:</strong> <span className="soft">{result.next_steps}</span></p>
      <a href={`/claim/${result.claim_id}`} className="tiny" style={{ display: "inline-block", marginTop: 10, fontWeight: 600 }}>Open full claim page (appeal + share) →</a>

      {result.flags.length > 0 && (
        <div className="mt16">{result.flags.map((f, i) => <p key={i} className="tiny" style={{ color: "var(--amber)" }}>⚑ {f}</p>)}</div>
      )}

      <details className="mt24" open>
        <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--teal-deep)", fontSize: 14 }}>Audit trail — {result.trace.length} checks, each tied to a policy clause</summary>
        <div className="mt16">
          {result.trace.map((t, i) => (
            <div className="trace-row" key={i}>
              <span className={`trace-icon ${t.passed ? "pass" : "fail"}`}>{t.passed ? "✓" : "✕"}</span>
              <div>
                <div className="trace-step">{t.step}</div>
                <div className="trace-detail">{t.detail}</div>
                {t.clause && <span className="trace-clause">policy · {t.clause}</span>}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
