# Sprint 0 Status — Integrasi Chatbot AI RAHO

Tanggal baseline: 4 Agustus 2026

## Goal

Menyiapkan fondasi produk, arsitektur, kontrak, keamanan, kualitas, dan delivery
untuk fitur RAG **Integrasi Chatbot AI** tanpa mengaktifkan jawaban AI pada
traffic customer.

Sprint ini tidak membangun fitur production. Rule engine deterministik yang
sudah ada tetap berjalan dan tidak diubah oleh artefak Sprint 0 AI.

## Status legend

- **Implemented:** sudah ada dan dapat diverifikasi pada repository saat ini.
- **Documented:** keputusan atau kontrak telah ditulis, tetapi implementasinya
  belum tersedia.
- **Planned:** masuk backlog sprint berikutnya.
- **Blocked:** membutuhkan keputusan stakeholder atau layanan eksternal.

## Implemented dan reusable

- [x] Workspace memiliki backend Express/TypeScript dan control panel
  React/TypeScript.
- [x] Admin BFF memiliki namespace `/api/admin/v1`, cookie authentication,
  permission server-side, CSRF untuk mutation, audit log, dan request ID.
- [x] Backend memiliki standard Admin API error envelope.
- [x] Health endpoint `/health/live` dan `/health/ready` tersedia.
- [x] PostgreSQL connection, migration harness, Vitest, Supertest, dan frontend
  component-test harness tersedia.
- [x] Control panel memiliki responsive left sidebar, API client, TanStack Query,
  serta pola loading/error state.
- [x] CI menjalankan check frontend, backend, anti-ban, dan build image
  production.
- [x] Baseline setelah foundation implementation: backend 17 file/161 test
  lulus; frontend 13 file/58 test lulus; lint, source/test typecheck, dan build
  lulus.
- [x] Read-only `GET /api/admin/v1/ai-chatbot/foundation` tersedia, dilindungi
  temporary permission `chatbot.manage`, dan tidak mengirim secret reference.
- [x] Environment parser untuk AI default-off, strict grounding, bootstrap
  tenant, provider/model reference, Redis, dan object-storage configuration;
  `AI_CHATBOT_ENABLED=true` ditolak selama runtime/release gate belum ada.
- [x] Sidebar kiri memiliki entry **Integrasi Chatbot AI** dan route shell
  `/ai-chatbot/*`, runtime-validated API client, MSW fixture, loading/error/
  placeholder states, serta feature-local error boundary.
- [x] Overview foundation dan sembilan module route entry tersedia; selain
  Overview masih placeholder yang jujur.
- [x] Additive development Compose overlay menyediakan PostgreSQL 16 + pgvector,
  Redis, dan MinIO. Bootstrap lokal telah diverifikasi: ketiga service sehat,
  extension `vector` tersedia, dan bucket `raho-ai-knowledge` terbuat secara
  idempotent.
- [x] CI mengaudit dependency production frontend/backend dan memvalidasi
  Compose overlay secara statis.

## Documented pada Sprint 0 AI

- [x] Scope FAQ/informasi saja; booking, pembayaran, diagnosis, rekomendasi
  medis personal, fine-tuning, dan multi-agent berada di luar MVP.
- [x] Namespace UI baru `/ai-chatbot/*`.
- [x] Namespace Admin API baru `/api/admin/v1/ai-chatbot/*`.
- [x] Boundary antara rule engine lama `/chatbot/rules` dan RAG baru.
- [x] Context diagram, container diagram, dan lima sequence flow utama.
- [x] Keputusan awal stack, strict grounding, tenant context, async processing,
  provider abstraction, structured output, feature flag, dan observability.
- [x] ERD/logical data model awal yang menggunakan kembali `messages`,
  `audit_logs`, dan **existing `handoff_tasks`**.
- [x] Draft OpenAPI awal; seluruh endpoint AI ditandai `planned`.
- [x] Delivery plan, backlog P0/P1/P2, Sprint 1 backlog, Definition of Ready,
  dan Definition of Done.
- [x] Master quality plan, requirement traceability matrix awal, bug severity,
  mock-provider strategy, dan release gate.
- [x] Threat model, security checklist awal, dan risk register.
- [x] Permission sementara untuk entry point AI ditetapkan ke
  `chatbot.manage`; permission granular tetap planned.

## Planned dan belum boleh dianggap implemented

- [ ] Tenant middleware dan server-derived tenant context.
- [ ] Live dependency probes dan fail-closed effective activation. Foundation
  endpoint saat ini melaporkan presence konfigurasi, bukan health dependency.
- [ ] AI integration settings dan prompt version API.
- [ ] Migration/schema dan vector query aplikasi; image, existing-volume
  compatibility, serta extension `pgvector` lokal sudah diverifikasi.
- [ ] Redis client, BullMQ worker, dan live queue health; Redis container sudah
  sehat pada overlay lokal.
- [ ] S3 client dan credential hardening; MinIO healthcheck dan bucket
  initializer lokal sudah diverifikasi.
- [ ] AI provider adapter, embedding adapter, mock provider, dan output schema
  validator.
- [ ] Knowledge, document, retrieval, runtime, logs, unanswered, analytics, dan
  handoff extension migrations/API.
- [ ] Secret manager, centralized log aggregation, dan error tracking.
- [ ] Backend ESLint, OpenAPI lint, anti-ban dependency gate, secret/container
  scan, serta live AI infrastructure smoke test pada CI.
- [ ] Development CD target dan credential.

## Acceptance status Sprint 0

| Acceptance criterion | Status | Catatan |
|---|---|---|
| Scope MVP dan non-goal terdokumentasi | Documented | Persetujuan Product Owner masih diperlukan |
| Tidak ada booking/payment di scope | Documented | Harus dipertahankan pada runtime dan UI berikutnya |
| Stack final terdokumentasi | Documented | Provider/model dan secret manager masih open |
| Repository dapat dibuild | Implemented | Backend dan frontend build lulus saat audit |
| CI berhasil | Partial | Functional checks + frontend/backend audit + Compose config ada; anti-ban audit, secret/container scan, dan live infra smoke belum ada |
| Health endpoint tersedia | Implemented | Dependency AI belum menjadi bagian readiness |
| PostgreSQL, pgvector, Redis, object storage tersedia | Partial | Dev services, existing-volume pgvector, dan MinIO bucket terverifikasi; application clients, Admin readiness probes, dan production services belum tersedia |
| Tenant context didefinisikan | Partial | Bootstrap tenant/env contract ada; authenticated tenant middleware/enforcement belum implemented |
| API key tidak disimpan di source | Partial | Contoh memakai placeholder; secret scan/manager belum tersedia |
| Backlog P0/P1/P2 dan Sprint 1 tersedia | Documented | Lihat delivery plan |
| Stakeholder menyetujui roadmap | Blocked | Membutuhkan Product Owner, Knowledge Owner, dan Medical Reviewer |

Deliverable development awal Sprint 0 selesai dan Sprint 1 dapat dimulai pada
vertical slice settings/tenant. Penutupan formal produk masih menunggu security
gate lanjutan dan approval stakeholder yang tercantum di atas; shell ini bukan
izin mengaktifkan traffic AI customer.

## Open decisions

- Product Owner dan pemilik akhir scope MVP.
- Knowledge Owner per kategori dan siapa yang berhak publish.
- Medical Reviewer dan daftar wording/safety yang disetujui.
- Copy final fallback, handoff, disclaimer medis, tone, dan bahasa alternatif.
- SLA, jam operasional, prioritas, dan assignment handoff.
- Data customer yang boleh dikirim ke model, retention log, serta deletion flow.
- AI chat provider/model, embedding provider/model, dimensi vector, timeout,
  retry, dan approved fallback model.
- Secret manager, object storage production, error tracking, dan log aggregator.
- Baseline latency, throughput, budget token, dan budget biaya.
- Strategi role target: menambah role AI khusus atau mempertahankan role preset
  dengan permission granular.
- Deployment development/staging dan owner credential.

## Artefak

Seluruh dokumen Sprint 0 AI berada di
`simple-whatsapp-chatbot/docs/ai-chatbot/` dan bersifat additive terhadap
dokumentasi control panel yang sudah ada.
