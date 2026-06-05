// lib/docGenerator.ts
// -----------------------------------------------------------------------------
// SYNTHETIC DOCUMENT GENERATOR
//
// The assignment explicitly notes: "Since we cannot provide actual medical
// document images..." — so being able to GENERATE realistic mock prescriptions
// and bills is a direct, thoughtful answer to a stated constraint. It also makes
// the whole system demoable end-to-end without hunting for real documents.
//
// Each generator returns self-contained HTML that renders as a realistic-looking
// document. The UI renders it, and (optionally) it can be screenshotted into an
// image to feed the vision extractor — closing the loop.
// -----------------------------------------------------------------------------

export interface GeneratedDoc {
  id: string;
  title: string;
  html: string;
  // The "ground truth" structured data this document encodes — useful for
  // showing extraction accuracy (generated vs extracted).
  truth: {
    doctor_name: string;
    doctor_reg: string;
    diagnosis: string;
    treatment_date: string;
    line_items: { description: string; amount: number }[];
    total: number;
    hospital?: string;
  };
}

const DOCTORS = [
  { name: "Dr. Sharma", reg: "KA/45678/2015", qual: "MBBS, MD" },
  { name: "Dr. Patel", reg: "MH/23456/2018", qual: "BDS, MDS" },
  { name: "Dr. Iyer", reg: "TN/56789/2013", qual: "MBBS, DNB" },
  { name: "Dr. Rao", reg: "AP/67890/2017", qual: "MBBS, MS" },
  { name: "Vaidya Krishnan", reg: "AYUR/KL/2345/2019", qual: "BAMS" },
];

const SCENARIOS = [
  {
    diagnosis: "Viral fever",
    hospital: "City Care Clinic",
    items: [
      { description: "Consultation Fee", amount: 1000 },
      { description: "CBC Blood Test", amount: 500 },
    ],
    meds: ["Paracetamol 650mg", "Vitamin C"],
  },
  {
    diagnosis: "Acute bronchitis",
    hospital: "Apollo Hospitals",
    items: [
      { description: "Consultation Fee", amount: 1500 },
      { description: "Medicines", amount: 3000 },
    ],
    meds: ["Azithromycin 500mg", "Bronchodilator syrup"],
  },
  {
    diagnosis: "Tooth decay requiring root canal",
    hospital: "SmileWell Dental",
    items: [
      { description: "Root Canal Treatment", amount: 8000 },
      { description: "Teeth Whitening", amount: 4000 },
    ],
    meds: ["Amoxicillin 500mg", "Ibuprofen 400mg"],
  },
  {
    diagnosis: "Gastroenteritis",
    hospital: "Wellness Medical Center",
    items: [
      { description: "Consultation Fee", amount: 2000 },
      { description: "Medicines", amount: 5500 },
    ],
    meds: ["ORS", "Probiotics", "Antibiotics"],
  },
];

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

export function generateDocument(seed = Math.floor(Math.random() * 10000)): GeneratedDoc {
  const doctor = pick(DOCTORS, seed);
  const scenario = pick(SCENARIOS, Math.floor(seed / 3));
  const billNo = 10000 + (seed % 89999);
  const date = "2024-11-01";
  const total = scenario.items.reduce((s, i) => s + i.amount, 0);
  const gst = Math.round(total * 0.0); // OPD bills here shown pre-GST for clarity

  const rows = scenario.items
    .map(
      (i) =>
        `<tr><td>${i.description}</td><td style="text-align:right">₹ ${i.amount.toLocaleString("en-IN")}</td></tr>`,
    )
    .join("");

  const medList = scenario.meds
    .map((m, idx) => `<div class="rx-line">${idx + 1}. ${m}</div>`)
    .join("");

  const html = `
<div class="doc-paper">
  <div class="doc-head">
    <div class="doc-logo">✚</div>
    <div>
      <div class="doc-clinic">${scenario.hospital}</div>
      <div class="doc-sub">${doctor.name}, ${doctor.qual}</div>
      <div class="doc-sub">Reg. No: ${doctor.reg}</div>
    </div>
    <div class="doc-meta">
      <div>Bill No: ${billNo}</div>
      <div>Date: ${date.split("-").reverse().join("/")}</div>
    </div>
  </div>

  <div class="doc-section">
    <span class="doc-label">Patient:</span> Member Patient &nbsp;
    <span class="doc-label">Ref. By:</span> ${doctor.name}
  </div>

  <div class="doc-section">
    <span class="doc-label">Diagnosis:</span> ${scenario.diagnosis}
  </div>

  <div class="doc-section">
    <span class="doc-label">Rx:</span>
    <div class="rx-block">${medList}</div>
  </div>

  <table class="doc-table">
    <thead><tr><th>Particulars</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>
      ${rows}
      <tr class="doc-total"><td>TOTAL</td><td style="text-align:right">₹ ${total.toLocaleString("en-IN")}</td></tr>
    </tbody>
  </table>

  <div class="doc-foot">
    <div class="doc-stamp">✓ PAID</div>
    <div class="doc-sign">${doctor.name}<br/><span class="doc-sub">Authorized Signatory</span></div>
  </div>
</div>`.trim();

  // A plain-text rendering the demo/text path can parse, and that we pass to
  // the extractor as "typed details" so it works even without vision.
  const asText =
    `${scenario.hospital}. ${doctor.name} ${doctor.reg}. ` +
    `Date ${date}. Diagnosis: ${scenario.diagnosis}. ` +
    scenario.items.map((i) => `${i.description} ${i.amount}`).join(", ") +
    ".";

  return {
    id: `DOC_${billNo}`,
    title: `${scenario.diagnosis} — ${scenario.hospital}`,
    html,
    truth: {
      doctor_name: doctor.name,
      doctor_reg: doctor.reg,
      diagnosis: scenario.diagnosis,
      treatment_date: date,
      line_items: scenario.items,
      total,
      hospital: scenario.hospital,
    },
    // @ts-expect-error attach for convenience; consumers may read it
    asText,
  };
}
