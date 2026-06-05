// app/claim/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Nav from "../../Nav";
import type { ClaimRecord } from "@/types";

export default function ClaimDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<ClaimRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appealReason, setAppealReason] = useState("");
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealing, setAppealing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/claim/${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setRecord(json.record);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitAppeal() {
    setAppealing(true);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_id: id, reason: appealReason }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setAppealOpen(false);
      setAppealReason("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAppealing(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 48, paddingBottom: 80, maxWidth: 720 }}>
        {loading && <p className="muted">Loading claim…</p>}
        {error && <p style={{ color: "var(--red)" }}>{error}</p>}

        {record && (
          <>
            <div className="row">
              <h1 style={{ fontSize: 34, fontFamily: "Fraunces" }}>
                Claim {record.claim_id}
              </h1>
              <span className={`pill ${record.result.decision}`}>
                {record.result.decision.replace("_", " ")}
              </span>
            </div>
            <p className="muted tiny mt8">
              {record.member.member_name} · {new Date(record.created_at).toLocaleString()}
            </p>

            <div className="card mt24">
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontSize: 40, fontFamily: "Fraunces", fontWeight: 600 }}>
                  ₹{record.result.approved_amount.toLocaleString("en-IN")}
                </span>
                <span className="muted">approved of ₹{record.result.breakdown.claimed.toLocaleString("en-IN")} claimed</span>
              </div>

              {record.result.llm_reasoning && (
                <p className="mt16" style={{ fontSize: 16, fontStyle: "italic" }}>
                  "{record.result.llm_reasoning}"
                </p>
              )}
              <p className="tiny mt16"><strong>Next steps:</strong> {record.result.next_steps}</p>

              {record.appeal && (
                <div className="mt16" style={{ background: "var(--blue-bg)", borderRadius: 10, padding: "12px 14px" }}>
                  <p className="tiny" style={{ color: "var(--blue)" }}>
                    ⟳ Appeal filed {new Date(record.appeal.requested_at).toLocaleDateString()} — “{record.appeal.reason}”
                  </p>
                </div>
              )}
            </div>

            {/* Audit trail */}
            <div className="card mt24">
              <h3 style={{ fontSize: 18 }}>Audit trail</h3>
              <div className="mt16">
                {record.result.trace.map((t, i) => (
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
            </div>

            {/* Appeals workflow */}
            {record.result.decision !== "APPROVED" && !record.appeal && (
              <div className="mt24">
                {!appealOpen ? (
                  <button className="btn ghost" onClick={() => setAppealOpen(true)}>
                    Disagree with this decision? Request a manual review
                  </button>
                ) : (
                  <div className="card">
                    <label>Why should this be reviewed?</label>
                    <textarea
                      rows={3}
                      value={appealReason}
                      onChange={(e) => setAppealReason(e.target.value)}
                      placeholder="e.g. The whitening was medically necessary after the root canal…"
                    />
                    <div className="mt16" style={{ display: "flex", gap: 10 }}>
                      <button className="btn" onClick={submitAppeal} disabled={appealing || !appealReason}>
                        {appealing ? <span className="spinner" /> : null} Submit appeal
                      </button>
                      <button className="btn ghost" onClick={() => setAppealOpen(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
