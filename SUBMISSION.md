# Submission Checklist & Demo Script

A practical guide to finishing and submitting this assignment.

## Before you submit

- [ ] Push to a **public GitHub repo** (or share access with the hiring team).
- [ ] Deploy to **Vercel** and paste the live URL into the README top section.
- [ ] Add `ANTHROPIC_API_KEY` (and optionally `MONGODB_URI`) in Vercel env vars.
- [ ] Record the **5–10 min demo video** (script below).
- [ ] Email deliverables: repo link, live URL, video link.

## Deliverables map (what the assignment asked for → where it is)

| Asked for | Where |
|-----------|-------|
| Working deployed app | Vercel URL (after you deploy) |
| Source code repo | this repo |
| README with setup | `README.md` |
| Architecture diagram | `ARCHITECTURE.md` (Mermaid, renders on GitHub) |
| API documentation | `README.md` → "API reference" |
| Decision logic flowchart | `ARCHITECTURE.md` → second diagram |
| List of assumptions | `README.md` → "subtle rules I derived" |
| Confidence scores (bonus) | every decision returns `confidence_score` |
| Appeals / manual review (bonus) | `app/claim/[id]` appeal button → `MANUAL_REVIEW` |
| Admin policy dashboard (bonus) | `app/admin` |
| Evaluation metrics (bonus) | `app/eval` + `npm run eval` → 100% |

## Demo video script (aim ~7 minutes)

**0:00 — The core idea (30s).**
"OPD claim adjudication decides money, so I deliberately kept the LLM out of the
financial decision. AI reads documents; deterministic code makes the call. Every
rupee is traceable to a policy clause."

**0:30 — Submit an approved claim (TC001) (90s).**
Upload or type Dr. Sharma / viral fever / consult ₹1000 + CBC ₹500. Show the
"what the AI read" panel, then the APPROVED ₹1350, then expand the audit trail.
Point out the ₹150 copay line.

**2:00 — Submit a rejected claim (TC003 or TC009) (90s).**
Show ₹7500 → REJECTED with `PER_CLAIM_EXCEEDED`, or the obesity case →
`SERVICE_NOT_COVERED`. Emphasise the clear, coded reason.

**3:30 — Show a PARTIAL (TC002) (60s).**
Root canal + whitening → PARTIAL ₹8000, whitening stripped as cosmetic.

**4:30 — Appeals workflow (45s).**
On the rejected claim's detail page, click "request a manual review", file an
appeal, show status flip to MANUAL_REVIEW.

**5:15 — Evaluation dashboard (60s).**
Open `/eval`. "Every official test case, scored against expected output —
100% on decision, amount, and rejection reason." This is your proof of correctness.

**6:15 — Architecture + what's next (45s).**
Show the two-layer diagram. Mention RAG grounding and confidence-from-extraction
as next steps. Done.

## Talking points for the 45-min interview

- **Why deterministic judgment?** Auditability, reproducibility, no silent drift.
- **How did you derive the money rules?** Reverse-engineered from expected outputs;
  documented each as an assumption (copay vs network, specialty sub-limits, etc.).
- **Where does AI add the most value?** Perception — reading blurry, handwritten,
  multilingual documents into clean structured data.
- **How would this scale?** Stateless API routes (serverless), MongoDB for claims,
  the rule engine is pure and unit-testable.
- **What breaks it?** Genuinely ambiguous documents → that's exactly when it routes
  to MANUAL_REVIEW rather than guessing.
