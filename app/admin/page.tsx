// app/admin/page.tsx — Policy configuration viewer.
"use client";

import Nav from "../Nav";
import policy from "@/data/policy_terms.json";

export default function AdminPage() {
  const c = policy.coverage_details as any;
  return (
    <>
      <Nav />
      <main className="wrap" style={{ paddingTop: 44, paddingBottom: 80 }}>
        <div className="eyebrow">Configuration</div>
        <h1 style={{ fontSize: 38, marginTop: 8 }}>Policy terms</h1>
        <p className="mt12 soft" style={{ fontSize: 16, maxWidth: 640 }}>
          The single source of truth the rule engine reads. Every decision on the
          Submit page traces back to one of these values.
        </p>

        <div className="grid3 mt24">
          <Metric label="Annual limit" value={`₹${policy.coverage_details.annual_limit.toLocaleString("en-IN")}`} />
          <Metric label="Per-claim limit" value={`₹${policy.coverage_details.per_claim_limit.toLocaleString("en-IN")}`} />
          <Metric label="Min claim" value={`₹${policy.claim_requirements.minimum_claim_amount}`} />
        </div>

        <div className="card mt24" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px 0" }}><h3 style={{ fontSize: 17 }}>Category sub-limits</h3></div>
          <table className="mt12">
            <thead><tr><th>Category</th><th>Sub-limit</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td>Consultation</td><td className="mono">₹{c.consultation_fees.sub_limit}</td><td className="tiny muted">10% co-pay · 20% network discount</td></tr>
              <tr><td>Diagnostics</td><td className="mono">₹{c.diagnostic_tests.sub_limit}</td><td className="tiny muted">MRI/CT need pre-auth above ₹10,000</td></tr>
              <tr><td>Pharmacy</td><td className="mono">₹{c.pharmacy.sub_limit}</td><td className="tiny muted">Generic mandatory</td></tr>
              <tr><td>Dental</td><td className="mono">₹{c.dental.sub_limit}</td><td className="tiny muted">Cosmetic excluded</td></tr>
              <tr><td>Vision</td><td className="mono">₹{c.vision.sub_limit}</td><td className="tiny muted">LASIK excluded</td></tr>
              <tr><td>Alternative medicine</td><td className="mono">₹{c.alternative_medicine.sub_limit}</td><td className="tiny muted">Ayurveda / Homeopathy / Unani</td></tr>
            </tbody>
          </table>
        </div>

        <div className="grid2 mt24" style={{ alignItems: "start" }}>
          <div className="card">
            <h3 style={{ fontSize: 16 }}>Waiting periods (days)</h3>
            <table className="mt12">
              <tbody>
                <tr><td>Initial</td><td className="mono">{policy.waiting_periods.initial_waiting}</td></tr>
                <tr><td>Pre-existing</td><td className="mono">{policy.waiting_periods.pre_existing_diseases}</td></tr>
                <tr><td>Diabetes</td><td className="mono">{(policy.waiting_periods.specific_ailments as any).diabetes}</td></tr>
                <tr><td>Hypertension</td><td className="mono">{(policy.waiting_periods.specific_ailments as any).hypertension}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 16 }}>Exclusions</h3>
            <ul className="mt12 tiny soft" style={{ paddingLeft: 18, lineHeight: 2 }}>
              {policy.exclusions.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="tiny muted">{label}</div>
      <div className="num" style={{ fontSize: 28 }}>{value}</div>
    </div>
  );
}
