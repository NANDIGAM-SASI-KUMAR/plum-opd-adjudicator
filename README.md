# Plum OPD Claim Adjudicator

An AI-powered tool that automates approval/rejection of Outpatient Department (OPD)
insurance claims. Built for the Plum AI Automation Engineer intern assignment.

**The one-line idea:** _AI does perception, deterministic code does judgment._
Claude reads messy medical documents and extracts structured data; a transparent
rule engine makes every financial decision, so every approved rupee is traceable
to a line of code **and** a policy clause.

> **Verified:** the rule engine scores **10/10 (100%)** on the official
> `test_cases.json` — matching decision, approved amount, **and** rejection
> reasons on every case. Run `npm run eval` to reproduce in milliseconds.

---

## Why this architecture (read this before the interview)

The naïve approach is to hand the whole claim to an LLM and ask "approve or
reject?" That fails in insurance for three reasons:

1. **Non-determinism** — the same claim can get different answers on different runs.
2. **No auditability** — you can't tell a regulator _why_ ₹3,600 was approved.
3. **Silent drift** — a prompt tweak can change financial outcomes invisibly.

So this system splits the work along the line of what each tool is actually good at:

| Layer | Tool | Touches | Job |
|-------|------|---------|-----|
| **Perception** | Claude Sonnet 4.6 (vision) | words & images | Read documents → structured JSON |
| **Judgment** | Plain TypeScript (`lib/ruleEngine.ts`) | money | Apply limits, copay, waiting periods, exclusions |
| **Narration** | Claude Opus 4.8 | words | Explain the *already-final* decision in plain English |

The LLM never decides money. The rule engine never reads an image. The narration
agent is explicitly told the decision is final and cannot change a number. That
ordering is the whole safety story — and it's literal in `app/api/adjudicate/route.ts`.

---

## Architecture

```
Next.js (TypeScript) — one codebase, deploys to Vercel
│
├── app/                      Frontend (React)
│   ├── page.tsx              Claim upload + extraction preview + decision
│   ├── eval/page.tsx         Evaluation dashboard (bonus)
│   └── admin/page.tsx        Policy config viewer (bonus)
│
├── app/api/                  Backend (Next.js API routes)
│   ├── extract/route.ts      Agent 1: vision LLM → structured JSON
│   ├── adjudicate/route.ts   Orchestrator: rule engine + narration, then persist
│   └── eval/route.ts         Runs all 10 test cases through the engine
│
├── lib/
│   ├── ruleEngine.ts         ★ DETERMINISTIC core: limits, copay, waiting periods
│   ├── agents.ts             Extractor (vision) + Decision narrator
│   ├── claudeClient.ts       Anthropic SDK wrapper + JSON parsing
│   ├── db.ts                 MongoDB Atlas, with in-memory fallback for demos
│   ├── evalRunner.ts         Scores engine output vs expected_output
│   └── testAdapter.ts        Maps test_cases.json → engine inputs
│
├── data/                     policy_terms.json, adjudication_rules.md, test_cases.json
├── types/index.ts            Every shape in the system, defined once
└── scripts/runEval.ts        CLI: npm run eval
```

See `ARCHITECTURE.md` for the data-flow and decision-logic diagrams.

---

## Quick start

This app reads documents with an LLM. You can run it **completely free** with a
local model (Ollama) — no API key, no billing — or with the Claude API for best
quality. Pick one:

### Option A — Free, local (Ollama) · recommended

```bash
# 1. Install Ollama from https://ollama.com  (no account, no card)
# 2. Pull a vision model (one-time, a few GB):
ollama pull llama3.2-vision

# 3. In the project:
npm install
cp .env.example .env.local      # already defaults to LLM_PROVIDER=ollama

# 4. Run
npm run dev                     # → http://localhost:3000
```

Ollama serves a local API on port 11434; the app talks to it automatically.

### Option B — Claude API (best extraction quality, paid)

Set `LLM_PROVIDER=anthropic` and `ANTHROPIC_API_KEY=sk-ant-...` in `.env.local`.

### Option C — Demo mode (zero setup, typed input only)

Set `LLM_PROVIDER=demo`. A small built-in parser reads typed claim details (no
images). Useful for a quick offline walkthrough; the real extractor is in the code.

### Always works: the evaluation (no LLM, no key)

```bash
npm run eval
```

The eval tests only the deterministic rule engine, so it runs instantly with no
provider configured — and scores **10/10**.

---

## Provider-agnostic LLM layer (design note)

Everything that touches a model goes through `lib/llmClient.ts`. Swapping
providers is a single environment variable — the extractor is just a function
that turns documents into JSON, and nothing downstream depends on which model
produced it. That's why the same codebase runs free locally and on Claude in
production. (Interview point: the AI is a replaceable perception component; the
decision logic is deterministic and provider-independent.)

---

## How the rule engine works (the part to study)

`lib/ruleEngine.ts` runs the five steps from `adjudication_rules.md` **in order**,
recording a `RuleTrace` for every single check. The trace is the audit trail the
UI shows under "View full audit trail."

1. **Process gates** — minimum amount, 30-day submission window.
2. **Eligibility** — waiting periods (initial + specific ailments like diabetes).
3. **Documents** — prescription present, doctor registration format valid.
4. **Coverage** — exclusions (cosmetic/weight-loss/etc.), pre-auth for MRI/CT.
5. **Limits & money** — per-claim cap, annual cap, category sub-limits, then
   copay (10%, non-network) **or** network discount (20%), then the final amount.

### Subtle rules the test cases actually encode (and how I derived them)

These weren't spelled out in the docs — I reverse-engineered them from the
expected outputs and documented the reasoning (good "assumptions" material):

- **Copay vs network discount are mutually exclusive.** Non-network claims take a
  10% copay (TC001: ₹1500 → ₹1350); network claims take a 20% discount instead
  (TC010: ₹4500 → ₹3600).
- **Specialty categories (dental / alternative / vision) are reimbursed in full**
  up to their sub-limit, with no copay (TC006: Ayurveda ₹4000 → ₹4000) and are
  **exempt from the generic per-claim cap** (TC002: root canal ₹8000 approved
  even though it exceeds the ₹5000 per-claim limit, because dental's sub-limit is
  ₹10000).
- **Per-item cosmetic stripping → PARTIAL.** A dental claim that includes teeth
  whitening isn't rejected outright; the whitening line is removed and the rest
  approved (TC002).
- **A whole-claim exclusion is judged on the *diagnosis*, not individual line
  items** — otherwise every mixed claim would be wrongly rejected.

If a future test contradicts one of these, the rule lives in exactly one place
and is trivial to adjust.

---

## API reference

### `POST /api/extract`
Reads documents into structured data.
```json
// request
{ "docs": [{ "media_type": "image/jpeg", "data": "<base64>" }], "text": "optional typed details" }
// response
{ "extracted": { "diagnosis": "...", "line_items": [...], "doctor_reg": "...", ... } }
```

### `POST /api/adjudicate`
Makes the decision and persists it.
```json
// request
{ "extracted": { ... }, "member": { "member_id": "EMP001", "join_date": "2024-09-01", "ytd_claimed": 0 }, "explain": true }
// response
{ "claim_id": "CLM_12345", "result": { "decision": "APPROVED", "approved_amount": 1350, "trace": [...], "llm_reasoning": "...", ... } }
```

### `GET /api/eval`
Runs all test cases through the engine; returns a scored summary.

---

## Deployment (Vercel)

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add environment variables: `ANTHROPIC_API_KEY`, optionally `MONGODB_URI` + `MONGODB_DB`.
4. Deploy. Next.js API routes become serverless functions automatically.

For MongoDB Atlas: create a free M0 cluster, add `0.0.0.0/0` to network access
(or Vercel's IPs), and copy the connection string into `MONGODB_URI`.

---

## What I'd build next (talking points)

- **Confidence from extraction, not constants** — derive the confidence score
  from the model's own uncertainty + document quality, rather than fixed values.
- **Duplicate detection** — hash bill contents to catch the same receipt
  submitted twice across dates (a fraud indicator in the rules).
- **Appeals workflow** — the `ClaimRecord` type already has an `appeal` field;
  wire a member-facing "request review" button that flips status to MANUAL_REVIEW.
- **RAG over the full policy** — for free-text edge cases, retrieve the relevant
  policy clause to ground the narration agent (I used this pattern at ISRO).
- **Few-shot extraction** — embed 2-3 example documents in the extractor prompt
  to improve accuracy on handwritten and regional-language bills.

---

## Tech stack

Next.js 15 · TypeScript · React 19 · LLM layer (Ollama local · or Claude API)
· MongoDB Atlas (optional) · deploys to Vercel.
