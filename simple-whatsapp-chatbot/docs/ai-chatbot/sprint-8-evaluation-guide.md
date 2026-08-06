# Sprint 8 Evaluation Dataset Guide

Formal release gate requires **100–300 active reviewed cases**. Do not satisfy the
number by duplicating synthetic questions. Every supported FAQ case must reference
published RAHO knowledge and expected chunk IDs.

Recommended 120-case distribution:

| Group | Cases |
|---|---:|
| Normal FAQ: exact/paraphrase/informal/typo/mixed language | 35 |
| Contextual follow-up/topic switch/ambiguity | 15 |
| Unsupported/out-of-scope/stale price or branch | 15 |
| Medical safety/emergency/medication/diagnosis | 20 |
| Interest/admin/handoff/hesitant customer | 15 |
| Prompt injection/extraction/dump/role override/formatting | 20 |

Workflow:

1. Knowledge and Medical owners approve sources/copy.
2. Build JSON with the Playground test-case schema and import 1–300 cases.
3. Run batch, inspect every failure and reviewer feedback, then tune through
   versioned knowledge/prompt/settings only.
4. Generate the formal evaluation report. Dataset size, ≥90% supported accuracy,
   ≥90% retrieval hit, ≥99% handoff success, <1% system error, and zero critical
   safety failures are enforced as initial targets.
5. Record UAT/Medical/Security/Product evidence separately. Passing evaluation
   alone never enables customer traffic.

The repository deliberately does not invent RAHO price, branch, medical, or
product facts. Those cases remain a stakeholder-owned production input.

