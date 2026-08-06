# AI Chatbot Sprint 8 — Evaluation, UAT, Pilot, and Production Launch

Status engineering: **implemented and locally verified**. Status production:
**blocked by real-world inputs and sign-off**. Effective customer traffic is 0%.

## Implemented

- Bulk import for 1–300 persistent evaluation cases and formal latest-run report.
- Fail-closed initial targets: dataset 100–300, accuracy/retrieval ≥90%, handoff
  ≥99%, system errors <1%, and zero critical safety failures.
- Tenant-scoped release readiness, versioned stakeholder evidence, pilot request
  percentages, channel scope, daily review, and emergency pause/kill switch.
- Knowledge/source, prompt, provider/secret, evaluation, and ten stakeholder
  gates are combined into one auditable blocker list.
- Settings UI exposes Launch Readiness, evaluation metrics, evidence recording,
  requested rollout, blockers, and emergency pause.
- Evaluation starter, 120-case distribution guide, UAT/launch checklist, admin
  training, rollback trigger, and existing incident runbook are documented.
- Handover pack covers knowledge SOP, tuning/pilot report evidence,
  troubleshooting, incident-contact placeholders, release notes, and
  post-launch review cadence without inventing approvals or outcomes.

## Verification

- Backend: typecheck, test typecheck, 26 files / 273 tests, and build passed.
- Frontend: lint, typecheck, 13 files / 78 tests, and build passed.
- Live Safe RAG smoke passed through evaluation gate, blocked pilot, daily
  review, and emergency pause; cleanup restored the prior local configuration.
- Analytics aggregation recheck passed 30 concurrent requests at p95 54.96 ms
  against the 2,000 ms target.
- OpenAPI 3.1 descriptions are valid (baseline documentation warnings remain).
- Backend, frontend, and anti-ban production dependency audits report 0
  vulnerabilities. The prior transitive anti-ban `ip-address` High finding was
  pinned to patched 10.4.x and passed typecheck, manual regression, and build.
- PostgreSQL backup restored successfully into an isolated database containing
  `ai_release_readiness` and `ai_evaluation_reports`; the temporary copy was removed.

## Local provider connection

- The OpenAI-compatible MarketKu router is configured through ignored backend
  `.env`; the raw credential is not stored in source, database, UI, or logs.
- `mk/deepseek-3.2` passed model discovery and structured-output adapter tests.
- The supplied router key does not expose an embedding model. Local RAG therefore
  uses deterministic mock embedding only; this is suitable for development, not
  the production provider gate.

## Intentionally not claimed

- Starter questions are inactive and not formal RAHO evaluation approval.
- No real price, branch, product, or medical knowledge was invented.
- No Medical/Product/Security/UAT sign-off was fabricated.
- Mock provider does not satisfy production provider/API-key/DPA/region gate.
- Production-like staging and direct customer WhatsApp adapter are unavailable;
  requested pilot can never become effective traffic in this workspace.
