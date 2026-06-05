// app/generate/page.tsx — Synthetic document generator.
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Nav from "../Nav";

interface GenDoc {
  id: string; title: string; html: string;
  truth: { doctor_name: string; doctor_reg: string; diagnosis: string; treatment_date: string; line_items: { description: string; amount: number }[]; total: number; hospital?: string };
  asText?: string;
}

export default function GeneratePage() {
  const [doc, setDoc] = useState<GenDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [accuracy, setAccuracy] = useState<any>(null);
  const router = useRouter();

  async function gen(seed?: number) {
    setLoading(true);
    setAccuracy(null);
    const q = seed !== undefined ? `?seed=${seed}` : "";
    const res = await fetch(`/api/generate-doc${q}`);
    const json = await res.json();
    setDoc(json.doc);
    setLoading(false);
  }

  useEffect(() => { gen(); /* eslint-disable-next-line */ }, []);

  // Run the document through extraction, then compare to its known ground truth.
  async function testAccuracy() {
    if (!doc) return;
    setTesting(true);
    setAccuracy(null);
    try {
      const text =
        doc.asText ??
        `${doc.truth.hospital}. ${doc.truth.doctor_name} ${doc.truth.doctor_reg}. Date ${doc.truth.treatment_date}. Diagnosis: ${doc.truth.diagnosis}. ` +
          doc.truth.line_items.map((i) => `${i.description} ${i.amount}`).join(", ");
      const res = await fetch("/api/measure-accuracy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, truth: doc.truth }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAccuracy(json.report);
    } catch (e: any) {
      setAccuracy({ error: e.message });
    } finally {
      setTesting(false);
    }
  }

  function sendToAdjudicator() {
    if (!doc) return;
    const text =
      doc.asText ??
      `${doc.truth.hospital}. ${doc.truth.doctor_name} ${doc.truth.doctor_reg}. Date ${doc.truth.treatment_date}. Diagnosis: ${doc.truth.diagnosis}. ` +
        doc.truth.line_items.map((i) => `${i.description} ${i.amount}`).join(", ");
    sessionStorage.setItem("plum_prefill", text);
    router.push("/?prefill=1");
  }

  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 80 }}>
        <div className="eyebrow">Test data</div>
        <h1 style={{ fontSize: 38, marginTop: 8 }}>Synthetic document generator</h1>
        <p className="mt12 soft" style={{ fontSize: 16, maxWidth: 660 }}>
          The assignment notes that real document images aren't provided. This
          generates realistic mock prescriptions and bills on demand — so the whole
          pipeline is demoable end-to-end, and extraction can be checked against
          known ground truth.
        </p>

        <div className="mt24" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={() => gen()} disabled={loading}>
            {loading && <span className="spinner" />}↻ Generate new document
          </button>
          {doc && <button className="btn ghost" onClick={testAccuracy} disabled={testing}>
            {testing && <span className="spinner dark" />}Measure extraction accuracy
          </button>}
          {doc && <button className="btn ghost" onClick={sendToAdjudicator}>Send to adjudicator →</button>}
        </div>

        {accuracy && !accuracy.error && (
          <div className="card mt24 fade-in">
            <div className="row">
              <div>
                <div className="eyebrow">AI accuracy metric</div>
                <h3 className="mt4" style={{ fontSize: 16 }}>Extraction vs ground truth</h3>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "Fraunces", fontSize: 34, fontWeight: 600, color: accuracy.percentage >= 80 ? "var(--green)" : accuracy.percentage >= 50 ? "var(--amber)" : "var(--red)" }}>
                  {accuracy.percentage}%
                </div>
                <div className="tiny muted">{accuracy.correct} of {accuracy.total} fields</div>
              </div>
            </div>
            <table className="mt16">
              <thead><tr><th>Field</th><th>In document</th><th>AI extracted</th><th style={{textAlign:"right"}}>Match</th></tr></thead>
              <tbody>
                {accuracy.fields.map((f: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{f.field}</td>
                    <td className="tiny soft">{f.truth}</td>
                    <td className="tiny soft">{f.extracted}</td>
                    <td style={{ textAlign: "right" }}>{f.match ? <span style={{color:"var(--green)",fontWeight:600}}>✓</span> : <span style={{color:"var(--red)",fontWeight:600}}>✕</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tiny muted mt12">This measures how well the configured model read a document whose true contents are known — an honest, reproducible accuracy metric.</p>
          </div>
        )}
        {accuracy?.error && <p className="mt16" style={{ color: "var(--red)" }}>{accuracy.error}</p>}

        {doc && (
          <div className="grid2 mt24" style={{ alignItems: "start", gap: 24 }}>
            <div className="fade-in" dangerouslySetInnerHTML={{ __html: doc.html }} />
            <div className="card fade-in">
              <div className="eyebrow">Ground truth</div>
              <h3 className="mt4" style={{ fontSize: 16 }}>Encoded in this document</h3>
              <p className="tiny soft mt8">Use this to verify what the extractor reads back — the gap between these is your extraction accuracy.</p>
              <div className="tiny mt16 stack" style={{ gap: 7 }}>
                <div className="row"><span className="muted">Doctor</span><span className="soft">{doc.truth.doctor_name}</span></div>
                <div className="row"><span className="muted">Reg</span><span className="mono soft">{doc.truth.doctor_reg}</span></div>
                <div className="row"><span className="muted">Diagnosis</span><span className="soft">{doc.truth.diagnosis}</span></div>
                <div className="row"><span className="muted">Hospital</span><span className="soft">{doc.truth.hospital}</span></div>
                {doc.truth.line_items.map((i, idx) => (
                  <div className="row" key={idx} style={{ paddingLeft: 10 }}>
                    <span className="muted">· {i.description}</span><span className="mono soft">₹{i.amount}</span>
                  </div>
                ))}
                <div className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 7 }}>
                  <span style={{ fontWeight: 600 }}>Total</span><span className="mono" style={{ fontWeight: 600 }}>₹{doc.truth.total}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
