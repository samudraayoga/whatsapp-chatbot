# Architecture Decisions — Integrasi Chatbot AI

## Status keputusan

- **Accepted:** dikunci untuk menjaga compatibility dan safety.
- **Provisional:** default untuk memulai development; dapat berubah melalui ADR.
- **Blocked:** tidak boleh diasumsikan sebelum stakeholder/dependency tersedia.

## ADR-AI-001 — Memakai stack dan deployment boundary existing

**Status:** Accepted

- Backend tetap Node.js, TypeScript, Express, dan PostgreSQL.
- Frontend tetap React, TypeScript, Vite, dan TanStack Query.
- Browser tetap berbicara hanya dengan Admin API/BFF same-origin.
- Tidak dibuat service NestJS/FastAPI baru pada Sprint 0.

Alasan: authentication, CSRF, permission, audit, request ID, health, test
harness, dan deployment boundary sudah tersedia dan dapat digunakan kembali.

## ADR-AI-002 — Namespace AI terpisah dari rule engine lama

**Status:** Accepted

- Route UI baru: `/ai-chatbot/*`.
- Admin API baru: `/api/admin/v1/ai-chatbot/*`.
- Existing `/chatbot/rules` dan `/api/admin/v1/chatbot/*` tetap menjadi rule
  engine deterministik.

Tidak ada endpoint existing yang diganti nama atau dipakai ulang dengan makna
RAG. Cutover traffic hanya melalui feature flag setelah evaluation dan release
gate lulus.

Sprint 4 telah mengimplementasikan sidebar/route shell, foundation,
tenant-scoped Settings, lifecycle AI Instructions, dan Knowledge Governance.
Document indexing, strict retrieval, structured Alpha orchestration, fallback,
dan trace juga implemented; direct runtime customer tetap blocked.

## ADR-AI-003 — Strict grounding dan fail-closed

**Status:** Accepted

AI hanya boleh menyusun jawaban dari context knowledge yang published, aktif,
belum kedaluwarsa, dan berada pada tenant yang sama. Retrieval kosong, score di
bawah threshold, provider error, structured-output invalid, atau validator gagal
menghasilkan fallback aman dan, sesuai policy, handoff.

Tidak ada mode bebas yang menjawab menggunakan pengetahuan umum model.

## ADR-AI-004 — Tenant context berasal dari server

**Status:** Accepted; authenticated membership middleware Implemented

Browser tidak memilih `tenant_id`. Tenant diturunkan dari authenticated admin
context. Runtime WhatsApp menurunkannya dari channel/session mapping. Selama
single-tenant, RAHO memakai UUID bootstrap yang stabil, bukan string bebas dan
bukan nilai request customer.

Sprint 1 membuat tenant dan membership stabil, menurunkan tenant context dari
admin session, serta menolak membership unresolved atau ambiguous. Browser body
tidak dapat mengganti tenant yang sudah diturunkan server.

Seluruh query knowledge, vector, prompt, conversation, handoff, cache, dan audit
wajib membawa tenant predicate. Cross-tenant access dianggap bug Critical.

## ADR-AI-005 — PostgreSQL + pgvector sebagai durable AI store

**Status:** Provisional; Compose, pgvector probe, dan Sprint 1–3 tables Implemented

PostgreSQL tetap source of truth dan `pgvector` dipakai untuk embedding. Dimensi
`VECTOR(n)` tidak dikunci sebelum embedding model disetujui. Timestamps baru
menggunakan `TIMESTAMPTZ`.

Migration AI incremental membuat tenant, membership, integration,
prompt-version, category, knowledge-item, knowledge-version, dan
question-variant, document, chunk/vector, dan embedding-usage tables beserta
constraint lifecycle utamanya.

Development overlay memakai image `pgvector/pgvector:0.8.2-pg16-trixie` agar
sesuai dengan base image PostgreSQL existing dan menyediakan init script
idempotent. Kompatibilitas volume serta extension presence sudah diverifikasi
lokal; migration dan tenant-filtered internal vector query aplikasi sudah
terverifikasi. Model/dimension/index produksi masih blocked evaluation.

## ADR-AI-006 — Async document processing melalui Redis queue

**Status:** Provisional; local implementation Verified, production hardening Blocked

Upload metadata dicatat secara durable, file ditempatkan pada S3-compatible
object storage, lalu extraction, cleaning, chunking, embedding, re-index, dan
retry dijalankan worker async. Referensi awal adalah Redis + BullMQ.

Job harus idempotent, memiliki attempt/backoff, dead-letter state, progress, dan
trace ID. File tidak disimpan sebagai blob pada PostgreSQL.

Sprint 3 mengimplementasikan S3 client, BullMQ producer/worker, revision-based
idempotency, exponential retry, retained failed jobs, processing stages, dan
transactional chunk replacement. MinIO/Redis local smoke terverifikasi; scanner
formal, parser sandbox, KMS, retention, dan deployment production belum approved.

## ADR-AI-007 — Provider ports/adapters dan structured output

**Status:** Accepted; ports, deterministic mock, and OpenAI-compatible adapter Implemented; production model approval Blocked

Domain memakai `ChatModelProvider` dan `EmbeddingProvider`, bukan SDK vendor di
orchestrator. Chat provider harus mendukung output terstruktur yang divalidasi
backend. Temperature default rendah; angka final, token limit, timeout, retry,
provider, dan model menunggu evaluation/cost decision.

Provider failure tidak boleh beralih ke model yang belum di-approve. Fallback
model hanya digunakan bila konfigurasi, data policy, schema, dan safety test yang
sama telah disetujui; selain itu gunakan customer-safe fallback message.

Sprint 4 hanya me-resolve `env://VARIABLE_NAME` pada provider call boundary.
Raw credential tidak masuk integration row, browser response, audit, trace, atau
log. Vault/cloud secret-manager schemes membutuhkan resolver deployment sebelum
production.

## ADR-AI-008 — Existing message dan handoff menjadi source of truth

**Status:** Accepted

- Message WhatsApp tetap disimpan pada existing `messages`.
- AI metadata disimpan pada tabel trace terpisah yang mereferensikan message,
  sehingga isi pesan tidak diduplikasi tanpa kebutuhan.
- Existing `handoff_tasks` harus digunakan kembali dan diperluas secara
  additive. Blueprint `CREATE TABLE handoff_tasks` tidak boleh dijalankan.
- Existing `audit_logs` digunakan untuk perubahan administrative AI.

Replay atau retry tidak boleh membuat handoff ganda; `source_message_id` tetap
menjadi idempotency boundary.

## ADR-AI-009 — Permission sementara dan target granular

**Status:** Provisional; granular Sprint 1–2 capability dan compatibility bridge Implemented

Tenant membership membawa `ai.settings.read/manage`,
`ai.prompts.read/manage/approve`, serta
`knowledge.read/edit/review/publish/categories.manage`. Existing
`chatbot.manage` tetap compatibility fallback untuk bootstrap admin, bukan model
otorisasi final.

Target lanjutan memperluas permission berdasarkan capability, misalnya:

- `ai.settings.read` dan `ai.settings.manage`;
- `knowledge.read`, `knowledge.edit`, `knowledge.review`, `knowledge.publish`;
- `ai.playground.use`, `ai.logs.read`, dan `ai.analytics.read`;
- existing `handoffs.manage` untuk pengambilan/penyelesaian handoff.

Keputusan apakah role AI khusus ditambahkan atau role existing tetap menjadi
preset permission masih blocked oleh Product/Security owner.

## ADR-AI-010 — Feature flag default-off dan readiness terdegradasi

**Status:** Accepted; live readiness dan fail-closed activation Implemented

`AI_CHATBOT_ENABLED` default `false` dan nilai `true` masih ditolak pada startup.
Feature flag target dapat membatasi tenant, strict grounding, document
upload, auto-handoff, analytics, dan pilot traffic setelah activation gate ada.

Ketika AI nonaktif, Redis/MinIO/provider yang belum tersedia tidak membuat core
WhatsApp/Admin API gagal readiness. Capability AI dilaporkan `disabled`,
`unavailable`, atau `not_instrumented`. Ketika AI aktif, dependency wajib gagal
secara terlihat dan runtime mengirim fallback, bukan silent success.

Integration readiness Sprint 1 memisahkan configured, reachable,
`not_configured`, dan `not_instrumented`. `effectiveEnabled` tetap literal false,
dan endpoint activation menolak seluruh permintaan selama global release hard-off
berlaku. Orchestrator/customer traffic belum tersedia.

## ADR-AI-011 — API dan error convention mengikuti Admin BFF

**Status:** Accepted

- Cookie session untuk browser.
- CSRF header untuk mutation.
- Permission diperiksa server-side.
- Response sukses membawa `data` serta `meta.requestId`/`meta.generatedAt`,
  mengikuti foundation contract dan pola Admin BFF.
- Error membawa `error.code`, safe `error.message`, optional safe `details`, dan
  `requestId`.
- Customer/provider input tidak boleh menentukan credential atau tenant.

Runtime service-to-service memakai credential terpisah, idempotency, dan channel
mapping; browser session tidak dipakai oleh WhatsApp adapter.

## ADR-AI-012 — Auditability dan version immutability

**Status:** Accepted; prompt/knowledge lifecycle, embedding usage, and Alpha response trace Implemented

Setiap respons AI merekam message/conversation, prompt version, knowledge item
dan version, retrieval score, model, token, latency, answer status, dan trace ID.
Published knowledge/prompt bersifat immutable; perubahan penting membuat versi
baru. Raw provider output hanya boleh berada pada log internal tersanitasi dan
sesuai retention policy.

Pada Sprint 2, publish atomik memindahkan pointer `published_version_id`.
Mengedit published item membuat draft versi berikutnya tanpa menonaktifkan versi
published lama. Sprint 3 mengantrekan indexing versi current published dan
merekam model/version/token/trace; archive menonaktifkan chunk.

## ADR-AI-013 — Cache tenant- dan version-aware

**Status:** Provisional; implementation Planned

Cache key minimal mencakup tenant, normalized question, knowledge version,
prompt version, model, dan retrieval setting. Publish/archive knowledge, prompt
aktif, model, atau retrieval setting harus menginvalidasi cache. Harga, promo,
dan data yang telah kedaluwarsa tidak boleh dilayani dari cache lama.

## Keputusan blocked

1. Chat/embedding provider, model, region, data processing terms, dan vector
   dimension.
2. Secret manager, S3-compatible production provider, error tracker, serta log
   aggregator.
3. Copy final fallback/handoff/disclaimer dan medical safety dataset.
4. Retention/deletion policy dan field customer yang boleh dikirim ke provider.
5. Handoff SLA, jam operasional, priority policy, dan assignment.
6. Knowledge owner/reviewer/approver dan separation-of-duty rule.
7. Permission/role target.
8. Performance/cost budget dan model fallback yang diizinkan.
