# Sprint 4 Retrieval Evaluation — Initial Report

## Status

Engineering smoke is complete; the formal 50–100-question reviewed dataset and
its acceptance target are **blocked pending Product, Knowledge Owner, and Medical
Reviewer input**. No synthetic result is presented as production quality.

## Verified synthetic scenarios

| Scenario | Expected | Result |
|---|---|---|
| Exact published FAQ | Correct source in final context and supported answer | Passed |
| Duplicate provider message | Same persisted trace, no second response record | Passed |
| No candidate at threshold | Configured fallback; chat provider call count zero | Passed |
| Archived knowledge | Active chunk removed | Passed in Sprint 3 lifecycle smoke |
| Provider malformed JSON | Rejected by adapter; safe fallback path | Passed unit test |
| Used source outside context | Rejected by runtime source-subset validator | Implemented/test boundary |

The live deterministic smoke records source, model, prompt version, token,
retrieval/provider/total latency, validation status, and trace ID. It is a
software-correctness gate, not Recall@K/MRR evidence.

## Required approved dataset

The owner-provided dataset must contain 50–100 Indonesian questions across FAQ
exact, paraphrase, typo, informal, ambiguous, and out-of-scope cases. Each row
needs expected knowledge/version/category, expected no-result behavior, reviewer,
and review date. Medical cases require Medical Reviewer approval.

Targets for Recall@K, MRR, no-result accuracy, and source relevance must be
agreed before the Sprint 4 Product acceptance gate can be marked complete.
