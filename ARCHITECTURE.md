# Architecture & Decision Logic

## System data flow

```mermaid
flowchart TD
    U[User uploads<br/>prescription + bill] --> EX[POST /api/extract]
    EX --> S[Claude Sonnet 4.6<br/>vision extraction]
    S --> J["Structured ExtractedClaim (JSON)"]
    J --> AD[POST /api/adjudicate]

    subgraph ORCH[Orchestrator]
      direction TB
      RE["lib/ruleEngine.ts<br/><b>DETERMINISTIC decision</b>"]
      RE --> NA[Claude Opus 4.8<br/>narrate decision]
    end

    AD --> RE
    NA --> DB[(MongoDB Atlas<br/>or in-memory)]
    DB --> UI[Decision + audit trail<br/>shown to user]

    style RE fill:#4a1f4e,color:#fff
    style S fill:#e8f0f7,color:#2c5e8a
    style NA fill:#e8f0f7,color:#2c5e8a
```

The two AI calls (blue) only ever touch words and images. The decision node
(purple) is plain TypeScript. Money flows through the purple box only.

## Adjudication decision logic

```mermaid
flowchart TD
    Start([Claim received]) --> Min{Amount ≥ ₹500<br/>and within 30 days?}
    Min -- no --> Rej1[REJECTED<br/>BELOW_MIN / LATE_SUBMISSION]
    Min -- yes --> Wait{Waiting period<br/>satisfied?}
    Wait -- no --> Rej2[REJECTED<br/>WAITING_PERIOD]
    Wait -- yes --> Docs{Prescription + valid<br/>doctor reg present?}
    Docs -- no --> Rej3[REJECTED<br/>MISSING_DOCUMENTS / DOCTOR_REG_INVALID]
    Docs -- yes --> Excl{Diagnosis in<br/>exclusions list?}
    Excl -- yes --> Rej4[REJECTED<br/>SERVICE_NOT_COVERED]
    Excl -- no --> Pre{MRI/CT &gt; ₹10k<br/>without pre-auth?}
    Pre -- yes --> Rej5[REJECTED<br/>PRE_AUTH_MISSING]
    Pre -- no --> Lim{Within per-claim,<br/>annual & sub-limits?}
    Lim -- no --> Rej6[REJECTED<br/>*_LIMIT_EXCEEDED]
    Lim -- yes --> Fraud{Fraud signals?<br/>multi-claim / high-value}
    Fraud -- yes --> MR[MANUAL_REVIEW]
    Fraud -- no --> Cosmetic{Cosmetic line<br/>items present?}
    Cosmetic -- yes --> Part[PARTIAL<br/>strip cosmetic, approve rest]
    Cosmetic -- no --> App[APPROVED<br/>apply copay / network discount]

    style App fill:#e6f4ec,color:#1f7a4d
    style Part fill:#fbf3e0,color:#b07d18
    style MR fill:#e8f0f7,color:#2c5e8a
    style Rej1 fill:#fbeaec,color:#b23a48
    style Rej2 fill:#fbeaec,color:#b23a48
    style Rej3 fill:#fbeaec,color:#b23a48
    style Rej4 fill:#fbeaec,color:#b23a48
    style Rej5 fill:#fbeaec,color:#b23a48
    style Rej6 fill:#fbeaec,color:#b23a48
```

## Priority rules (when checks conflict)

Per `adjudication_rules.md`, evaluated top-down:

1. Safety first — fraud patterns → `MANUAL_REVIEW`
2. Policy exclusions override everything → `REJECTED`
3. Hard limits cannot be exceeded → `REJECTED` / capped
4. Medical necessity is mandatory
5. When in doubt → `MANUAL_REVIEW`
