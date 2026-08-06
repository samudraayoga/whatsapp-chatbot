# AI Chatbot Sprint 7 — Production Release Candidate

Status engineering lokal: **implemented**. Status production RC: **belum dapat
ditandatangani** sampai staging, provider, budget, alert recipient, retention,
load target, dan security/privacy owner disetujui. Customer traffic tetap hard-off.

## Implemented

- Tenant-scoped Analytics KPI, daily trends, top questions/fallback/knowledge,
  handoff reasons, token dan estimated cost.
- Operational warning untuk provider error, fallback, latency, queue, overdue
  handoff, dan cost budget.
- Pricing, budget, retention, cache TTL, dan threshold dengan optimistic revision.
- Supported-answer cache; tidak untuk medical/personal/contextual/handoff, key
  memuat tenant, question, knowledge signature, prompt, model, dan retrieval.
- Cache invalid secara logis pada perubahan knowledge/prompt/model/retrieval dan
  fail-open bila cache storage bermasalah.
- Structured allowlist logs untuk received/retrieval/cache/response tanpa raw question.
- Prompt/knowledge changed-field view dan published metadata.
- Conversation anonymization, bounded retention batch, masked export, dan audit.
- Admin/public runtime rate limit, input limit, CSRF, origin validation, Helmet,
  tenant permission, document security, dan AI security regression tetap aktif.
- Analytics dashboard, cost view, trend, warning banner, diff, serta operations editor.
- Incident/backup/rollback/secret-rotation runbook dan performance smoke command.

## Local verification evidence

- Live RAG/operations smoke: cache hit, analytics, cost, version diff, and
  anonymization passed.
- Analytics aggregation: 30 concurrent requests, p95 70.60 ms against the
  initial dashboard target below 2 seconds.
- PostgreSQL custom-format backup restored into an isolated database; all 12
  `ai_*` tables including cache/settings/traces were present, then the isolated
  drill database was removed.
- Backend full gate: 26 files/269 tests, typecheck and build passed.
- Frontend full gate: lint, typecheck, 13 files/78 tests and build passed.
- Backend/frontend production dependency audit: 0 vulnerabilities; source scan
  found 0 credential-pattern matches.
- AI/Admin OpenAPI valid with 30 non-blocking documentation warnings. Frontend
  bundle is 530.93 kB and still emits the existing code-splitting warning.

## External release gates

- Production-like staging dan rolling/blue-green pipeline belum tersedia.
- Provider/model/region/API key dan harga token final belum dipilih.
- Target load, budget, alert recipient, retention, DPA/privacy, serta on-call belum disetujui.
- Formal OWASP/security scan, production backup restore, failover, Product/Medical
  sign-off tetap wajib sebelum status Release Candidate final.
