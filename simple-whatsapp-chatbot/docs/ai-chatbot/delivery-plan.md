# Delivery Plan — Integrasi Chatbot AI RAHO

## Delivery objective

Mengirim vertical slice bertahap dari settings dan tenant isolation sampai pilot
RAG yang strict-grounded, dapat diaudit, aman untuk pertanyaan kesehatan umum,
dan selalu memiliki fallback/handoff.

Dokumen ini adalah backlog baseline. Estimasi bukan komitmen tanggal dan harus
disesuaikan dengan kapasitas aktual.

## Scope control

### In scope MVP

- Settings, prompt version, knowledge governance, document processing.
- Embedding/vector retrieval dan grounded response generation.
- Safety pre-check, output validator, fallback, interest detection, handoff.
- Playground, conversation logs, unanswered questions, analytics, audit.

### Out of scope MVP

- Booking/reservasi dan payment.
- Diagnosis, resep, rekomendasi terapi personal, dan janji hasil.
- Model bebas menjawab tanpa context resmi.
- Fine-tuning, multi-agent, advanced reranker, A/B prompt, URL ingestion, dan
  channel selain WhatsApp.

Change request yang memperluas scope membutuhkan Product Owner, Security/Privacy,
dan Medical Reviewer sesuai dampaknya.

## Environments

| Environment | Purpose | AI traffic | Status baseline |
|---|---|---|---|
| Local | Development dengan mock provider | Synthetic only | Operational for Sprint 3; pgvector, BullMQ/Redis, MinIO, document worker, and vector-search smoke verified |
| Development | Shared integration | Synthetic/internal | Planned |
| Staging | Production-like regression/evaluation | Approved test data | Planned |
| Pilot | Tenant/traffic terbatas | Consented limited traffic | Optional/planned |
| Production | Customer traffic | Feature-flagged rollout | Planned |

Secrets harus berbeda per environment. Production data/credential tidak boleh
digunakan di local atau development.

## Branching and change control

Repository saat ini memakai `main`. Delivery dapat memakai short-lived feature
branches dan pull request ke `main`; environment mapping final mengikuti proses
deployment tim RAHO. Draft branch model dari blueprint (`develop`, `release/*`,
`hotfix/*`) tidak dianggap implemented sampai repository protection dan CD
benar-benar dikonfigurasi.

Minimum pull-request gate:

1. Contract/API/data-model change dijelaskan.
2. Test dan threat/privacy impact diperbarui.
3. Migration mempunyai forward verification dan rollback/roll-forward plan.
4. Knowledge/prompt wording memiliki reviewer yang sesuai.
5. Tidak ada Critical/High bug atau security finding tanpa accepted exception.

## Feature flags

Planned flags:

| Flag | Default | Scope |
|---|---:|---|
| `AI_CHATBOT_ENABLED` | `false` | Global kill switch |
| `AI_CHATBOT_TENANT_ENABLED` | `false` | Per-tenant activation |
| `AI_CHATBOT_STRICT_GROUNDING` | `true` | Tidak boleh off pada MVP production |
| `AI_CHATBOT_DOCUMENT_UPLOAD` | `false` | Admin capability |
| `AI_CHATBOT_AUTO_HANDOFF` | `false` | Per-tenant policy |
| `AI_CHATBOT_ANALYTICS` | `false` | New analytics surfaces |
| `AI_CHATBOT_PILOT_PERCENT` | `0` | Controlled traffic rollout |

Flag tidak menggantikan permission atau release gate. Strict grounding tidak
boleh dinonaktifkan melalui UI production.

## Roadmap

| Sprint | Duration | Milestone | Primary output |
|---|---:|---|---|
| 0 | 1 minggu | Development Ready | Scope, architecture, contract, backlog, quality/security baseline |
| 1 | 2 minggu | Core Foundation | Tenant, settings, prompt versions, audit, feature flags |
| 2 | 2 minggu | Knowledge Governance | Category/FAQ/article CRUD and publish workflow |
| 3 | 2 minggu | Searchable Knowledge | Upload, queue, extraction, chunking, embedding |
| 4 | 2 minggu | Alpha RAG | Retrieval, strict grounding, runtime, source tracking |
| 5 | 2 minggu | Safety and Handoff | Safety, validator, memory, interest, existing handoff extension |
| 6 | 2 minggu | Beta Operations | Playground, logs, unanswered workflow |
| 7 | 2 minggu | Release Candidate | Analytics, observability, security/performance hardening |
| 8 | 2 minggu | Production Gate | Evaluation, UAT, pilot, tuning, launch/handover |

## Prioritized backlog

### P0 — Required before launch

- Tenant context and isolation at repository, vector, cache, job, and runtime.
- Integration setting with secret reference and AI default-off.
- Prompt/instruction version and approved safety copy.
- Knowledge CRUD and draft/review/approve/publish/archive workflow.
- Document upload validation, malware scanning, processing queue, retry.
- Chunking, embedding, vector indexing, and published/validity filters.
- Strict-grounded runtime, structured output, source tracking, and fallback.
- Medical/prompt-injection pre-check and output validator.
- Existing `handoff_tasks` integration with idempotency, reason, priority, SLA.
- Conversation trace, audit, Playground, error handling, and operational
  visibility.
- Provider/key security, privacy minimization, deletion flow, monitoring, and
  rollback.

### P1 — Important for operation

- Unanswered Questions workflow and create-draft-FAQ action.
- Analytics, prompt/knowledge diff, admin feedback, cost monitoring.
- Knowledge expiration alerts and document preview.
- Complete audit views and handoff alerting.
- Cache with version-aware invalidation.

### P2 — After MVP is stable

- Advanced hybrid retrieval and dedicated reranker.
- Automatic FAQ clustering/suggested drafts.
- Prompt A/B testing and advanced analytics.
- Controlled URL ingestion.
- Multi-channel and broader tenant/fleet UX.

## Sprint 1 backlog

### Backend/data

- [x] Add stable tenant and admin membership schema/migration.
- [x] Add authenticated `TenantContext`; reject unresolved or ambiguous tenant.
- [x] Add tenant-isolation negative service and authenticated route tests.
- [x] Add `ai_integrations` with optimistic revision and no plaintext secret.
- [x] Add `ai_prompt_versions` with immutable publish semantics.
- [x] Add provider/embedding ports plus deterministic mock implementations.
- [x] Parse/report global AI default-off dan strict-grounding configuration.
- [x] Implement read-only foundation contract
  `GET /api/admin/v1/ai-chatbot/foundation`.
- [x] Add effective activation/release-gate service and live dependency probes;
  configuration presence alone is not readiness.
- [x] Implement integration, connection-test, and prompt contract under
  `/api/admin/v1/ai-chatbot/*`.
- [x] Reuse existing request ID, error envelope, auth, CSRF, permission, and audit.

### Frontend

- [x] Add `chatbot.manage`-gated `/ai-chatbot/*` sidebar and nine-module route
  shell, with Overview available and honest placeholders.
- [x] Settings screen with disabled/readiness states and redacted credential state.
- [x] AI Instructions list/editor/status shell.
- [x] Standard loading, empty, error, retry, unsaved-change, and mutation states.
- [x] Runtime-validate every new response contract.

### Infrastructure/security/QA

- [x] Add static development Compose overlay for pgvector PostgreSQL, Redis, and
  MinIO.
- [x] Add pgvector existing-volume verification, pinned pgvector image, MinIO
  healthcheck/bucket initializer, and local live bootstrap.
- [ ] Add Redis/MinIO application clients and automated live infrastructure
  smoke test in CI.
- [x] Secret-reference-only validation and environment-specific placeholders.
- [x] Add frontend/backend production dependency audit and Compose config
  validation to CI.
- [ ] Add backend lint, OpenAPI lint, anti-ban audit, secret/container scan, and
  live infrastructure smoke.
- [ ] Resolve or accept with expiry the high `ip-address` dependency finding in
  `baileys-antiban`.
- [x] Add foundation contract, secret-redaction, and feature-default-off tests.
- [x] Add authenticated tenant-isolation negative tests with the Sprint 1 tenant
  repository boundary.
- [ ] Product/Medical approval for initial prompt, fallback, handoff, disclaimer.

## Sprint 2 backlog

### Backend/data

- [x] Add tenant-scoped category, stable knowledge item, immutable version, and
  question-variant schema with constraints and indexes.
- [x] Seed the 12 baseline categories idempotently for the bootstrap tenant.
- [x] Implement category and FAQ/article CRUD with optimistic concurrency.
- [x] Implement Draft → Review → Approved → Published → Archived transitions
  plus request-revision.
- [x] Preserve an active published version while edits create a new draft.
- [x] Add published/validity filtering and transactional bulk publish/archive.
- [x] Reject deletion of categories in use and draft deletion that would break
  immutable history.
- [x] Normalize variants, fingerprint content, and reject raw HTML/javascript
  content before persistence.
- [x] Add granular `knowledge.read/edit/review/publish/categories.manage`
  authorization, CSRF, tenant isolation, and redacted audit records.

### Frontend/contracts

- [x] Replace the Knowledge placeholder with category management, searchable
  and filterable list, pagination, status badges, and lifecycle actions.
- [x] Add FAQ/article editor with variants, tags, metadata, validity, source,
  internal notes, disclaimer, priority, and unsaved-change protection.
- [x] Add bulk publish/archive and safe plain-text article preview.
- [x] Runtime-validate Knowledge API responses and provide mock handlers/tests.
- [x] Synchronize AI and merged Admin OpenAPI contracts.

### QA/review boundaries

- [x] Verify migration and rollback-scoped Draft → Published → new Draft flow
  against PostgreSQL.
- [x] Cover validation, fingerprinting, authorization, CSRF, tenant override,
  lifecycle, UI workflow, and nested editor routes.
- [x] Keep embedding/indexing out of Sprint 2; it starts in Sprint 3.
- [ ] Knowledge Owner approves category taxonomy and initial production content.
- [ ] Medical Reviewer approves health-related content and disclaimer wording.
- [ ] Product/Security approves final reviewer/publisher role mapping.

## Sprint 3 backlog

### Backend/data

- [x] Add tenant-scoped document, vector chunk, and embedding-usage schemas.
- [x] Validate PDF, DOCX, TXT, MD, and CSV by extension, content/MIME, size,
  emptiness, and baseline malware signature before private storage.
- [x] Implement S3-compatible object storage and BullMQ processing with retry,
  backoff, retained failed jobs, progress stages, and revision idempotency.
- [x] Extract/clean content and create heading-aware chunks around 300–600
  tokens with overlap and source metadata.
- [x] Batch embedding through the provider port, transactionally replace chunks,
  and record token/model/trace usage.
- [x] Index only current published and valid FAQ/article versions; deactivate
  chunks when knowledge or documents are archived.
- [x] Add tenant/status/validity-filtered internal vector search.

### Frontend/contracts

- [x] Add drag/drop upload with progress, category, supported-type guidance,
  and safe validation errors.
- [x] Add document list, status filters/stepper, processing queue, retry,
  reprocess, archive, delete, extraction preview, and chunk inspection.
- [x] Add published-knowledge re-index and internal search-test controls.
- [x] Synchronize runtime schemas, mock handlers, AI OpenAPI, and merged Admin
  OpenAPI.

### QA/review boundaries

- [x] Verify real MinIO → BullMQ/Redis → extraction → chunk → pgvector flow.
- [x] Verify idempotent reprocess, published FAQ indexing, vector result, and
  archive deactivation using the deterministic embedding mock.
- [x] Cover all five formats plus empty, oversized, fake MIME, and baseline
  malware rejection.
- [ ] Select and evaluate the production embedding provider/model/dimension.
- [ ] Approve a production malware scanner, parser sandbox/resource limits,
  object-storage encryption/KMS, retention, and deletion policy.

## Sprint 4 backlog

### Backend/data

- [x] Add tenant-scoped conversation, message trace, and ranked source schemas.
- [x] Normalize query, generate query embedding, retrieve configurable Top-K,
  deduplicate, apply threshold, final-context count, and context-token limit.
- [x] Enforce active/current-published/valid/document-ready/tenant filters in
  vector SQL before prompt construction.
- [x] Build a fixed instruction hierarchy that treats knowledge and customer
  text as untrusted data and requires structured JSON output.
- [x] Validate answer shape and used knowledge IDs against supplied context;
  malformed/unsupported/provider-error output becomes configured fallback.
- [x] Persist conversation/messages, model, prompt version, ranked sources,
  token estimates/provider usage, retrieval/provider/total latency, validation,
  and unique trace ID.
- [x] Enforce provider-message idempotency and replay the persisted response.
- [x] Add an OpenAI-compatible chat/embedding adapter using server-side
  `env://...` secret references; preserve deterministic mock testing.
- [x] Add API-key protected Alpha runtime behind a non-production-only flag;
  keep direct customer WhatsApp cutover hard-off.

### Frontend/contracts

- [x] Make Testing Playground available as the Sprint 4 Alpha RAG Console.
- [x] Display answer/status, retrieved and used sources, score, model, prompt,
  token, latency, validation, and trace ID without sending WhatsApp messages.
- [x] Synchronize runtime Zod contracts, fixtures, mocks, AI OpenAPI, and merged
  control-panel OpenAPI.

### QA/evaluation boundaries

- [x] Live smoke supported answer, source trace, token/latency persistence,
  duplicate replay, and no-context provider short circuit.
- [x] Cover provider secret resolution, structured parse/malformed output,
  Admin CSRF/permission/tenant boundary, and service API-key/idempotency guard.
- [ ] Product/Knowledge/Medical team supplies and approves the initial 50–100
  question retrieval dataset and target Recall@K/MRR/no-result accuracy.
- [ ] Production provider/model/region, cost budget, and data-use terms approved.

## Sprint 5 backlog — completed engineering, external approval open

- [x] Deterministic emergency, medical, diagnosis, dosage, stop-treatment,
  prompt-injection, explicit-admin, and normal-FAQ pre-check.
- [x] Backend-final output validator for source subset, unsupported claims,
  diagnosis/result guarantees, treatment-stop wording, leakage, length, and disclaimer.
- [x] Metadata-driven/configured disclaimer injection without duplication.
- [x] Bounded 6–10-message memory, deterministic summary, topic/knowledge state,
  and no cross-session memory.
- [x] Rule + structured interest detection and mandatory admin/interest handoff.
- [x] Atomic, idempotent extension of existing `handoff_tasks` with AI metadata.
- [x] Handoff detail, assign, in-progress, resolve, close, and Safe RAG evidence UI.
- [x] Provisional automated safety corpus and live Sprint 5 acceptance smoke.
- [ ] RAHO Medical/Product approves clinical rules, responses, disclaimer,
  operating hours/SLA, and formal evaluation targets.

## Sprint 6 backlog — completed engineering, formal evaluation approval open

- [x] Playground recent-context and prompt-version simulation on the runtime pipeline.
- [x] Persistent test case repository with category/source/content/handoff assertions.
- [x] Bounded batch runner, pass/fail report, trace evidence, and two-run comparison.
- [x] Tenant-scoped Conversation Logs, filters, trace/source detail, and masked CSV.
- [x] Audited Admin feedback with seven controlled review types.
- [x] Exact-normalized Unanswered Questions aggregation and occurrence links.
- [x] Reviewing/ignored/resolved/knowledge-created workflow.
- [x] Create a draft FAQ from unanswered; no automatic review or publish.
- [ ] Product/Knowledge/Medical approves the formal evaluation dataset and target.
- [ ] Retention/export policy, Admin training, and Beta sign-off are recorded.

## Workstreams and ownership

Named people are not yet assigned. Roles below are required owners, not proof of
staffing.

| Workstream | Accountable role | Responsibilities | Status |
|---|---|---|---|
| Product/scope | Product Owner | Scope, priority, copy, acceptance, roadmap | Blocked assignment |
| Knowledge | Knowledge Owner | Category coverage, source, validity, cadence | Blocked assignment |
| Medical safety | Medical Reviewer | Restricted wording, dataset, disclaimer, sign-off | Blocked assignment |
| Backend/data | Backend/Tech Lead | Tenant, API, queue, RAG, migration, reliability | Team assignment open |
| Frontend/admin | Frontend Lead | Role-based operation and accessible states | Team assignment open |
| AI evaluation | AI Engineer/Lead | Model, retrieval, prompt, evaluation, tuning | Team assignment open |
| Security/privacy | Security/Privacy Owner | Threat controls, retention, provider review | Blocked assignment |
| QA | QA Lead | RTM, automation, regression, UAT | Team assignment open |
| Platform | DevOps/SRE | Environments, secret, CI/CD, monitoring, backup | Team assignment open |
| Handoff operation | Customer Service Owner | SLA, queue, assignment, operating hours | Blocked assignment |

Separation of duty target: editor membuat knowledge, reviewer menyetujui, dan
publisher yang berwenang menerbitkan. Sprint 2 menyediakan capability granular
dan lifecycle terpisah, tetapi pemetaan reviewer/publisher final tetap menunggu
keputusan Product/Security; compatibility fallback `chatbot.manage` belum boleh
dianggap sebagai approval model final.

## Definition of Ready

Story boleh masuk sprint bila:

- user story dan business value jelas;
- acceptance criteria dapat diuji;
- UI/UX tersedia bila relevan;
- API contract tersedia untuk perubahan lintas frontend/backend;
- dependency, migration, feature flag, dan rollback diidentifikasi;
- data/knowledge contoh tersedia tanpa production PII;
- tenant/security/privacy/medical impact dinilai;
- reviewer bisnis/medis dan owner dependency ditentukan;
- test approach dan observability requirement tersedia;
- story cukup kecil untuk selesai dalam satu sprint;
- blocker eksternal mempunyai owner dan target keputusan.

## Definition of Done

Story selesai bila:

- implementation dan review selesai;
- lint, typecheck, unit, contract, integration, dan acceptance test relevan lulus;
- tenant isolation negative test lulus;
- strict-grounding/safety behavior diuji untuk AI flow;
- logging/metrics/error handling tersedia tanpa secret/PII leakage;
- audit tersedia untuk mutasi administrative;
- OpenAPI, frontend runtime schema, fixture, dan docs sinkron;
- migration mempunyai forward check dan rollback/roll-forward plan;
- feature tersedia di development/staging dengan default flag yang aman;
- security/privacy/medical review selesai sesuai dampak;
- tidak ada Critical/High bug terbuka;
- Product Owner menerima demo.

## Release gates

### Alpha — end Sprint 4

- Knowledge searchable dengan tenant/status/validity filters.
- Strict-grounded runtime dan no-context fallback.
- Prompt/knowledge/model/source/trace tercatat.
- No cross-tenant test lulus.
- Tidak untuk customer production.

### Beta — end Sprint 6

- Safety pre-check, output validator, handoff, Playground, logs, unanswered.
- Admin dapat mengoperasikan queue/workflow.
- Approved medical copy dan internal evaluation berjalan.

### Release Candidate — end Sprint 7

- Analytics, metrics, alert, dependency/security scan, load test.
- Backup/restore drill, full regression, privacy/retention implementation.
- Siap pilot, belum otomatis production.

### Production — end Sprint 8

- UAT, medical approval, evaluation target, pilot gate, admin training.
- Incident runbook, rollback/kill switch, cost limits, production sign-off.
- Critical/High bug = 0.

Engineering status: evaluation/reporting, evidence gates, daily review,
sequential pilot requests, admin guidance, and emergency pause are implemented.
Production status remains blocked: real 100–300-case results, named owners,
Medical/Product/Security/UAT approval, production provider/platform, staging
evidence, and customer-adapter cutover are external inputs and were not fabricated.

## External dependencies remaining after Sprint 8

Sprint 8 launch-control tooling is ready, but customer traffic cannot open until:

1. Product Owner approves MVP/non-goals and roadmap.
2. Knowledge Owner, Medical Reviewer, Security/Privacy, and Handoff owner exist.
3. Provider/model and data-handling decisions have owners and deadlines.
4. Production pgvector/Redis/object-storage access, secret manager, KMS,
   malware scanner, and parser isolation are operationally approved.
5. CI security gate is added and the current high dependency finding is resolved
   or accepted temporarily with an owner and expiry.

## Demo checklist

- [x] Show new left-sidebar AI entry and route namespace.
- [x] Show that existing deterministic chatbot remains a separate route/config.
- [ ] Show architecture and sequence diagrams.
- [x] Lint the OpenAPI and retain explicit `planned` markers for later sprints.
- [x] Run frontend/backend checks.
- [x] Show development pgvector/Redis/object-storage live health, extension, and
  bucket bootstrap.
- [x] Show grounded Alpha answer, source/score, token/latency/trace, idempotent
  replay, and no-context fallback without a customer WhatsApp send.
- [ ] Show backlog, release gates, open decisions, and named owners.
