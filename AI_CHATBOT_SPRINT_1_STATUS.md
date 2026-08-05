# AI Chatbot RAHO — Sprint 1 Status

Tanggal verifikasi: 5 Agustus 2026  
Status engineering: **Selesai**  
Status customer runtime: **Hard-off / belum dirilis**

## Hasil Sprint 1

- Stable `tenants` dan `admin_tenant_memberships` dengan tenant context yang
  diturunkan dari authenticated admin session. Context unresolved/ambiguous
  ditolak; tenant dari request body tidak dipercaya.
- `ai_integrations` tenant-scoped dengan optimistic revision, strict grounding,
  opaque secret reference, redacted API response, readiness, connection test,
  audit, serta activation yang fail-closed.
- `ai_prompt_versions` dengan version allocation, draft, approve, publish,
  archive versi published sebelumnya, dan maksimum satu published version per
  tenant.
- Provider ports (`ChatModelProvider`, `EmbeddingProvider`) dan deterministic
  mock. Provider asing tidak dipilih secara diam-diam.
- Live probe PostgreSQL/pgvector, Redis, object storage, chat provider, dan
  embedding provider. `effectiveEnabled` tetap literal `false`.
- Menu kiri **Integrasi Chatbot AI** tetap berada di namespace
  `/ai-chatbot/*`; halaman Settings dan AI Instructions sekarang operasional.
- Runtime schema frontend, MSW mocks, loading/error/mutation state, credential
  redaction, revision conflict handling, dan unsaved-change protection.
- OpenAPI AI standalone dan Admin API gabungan telah disinkronkan dan dilint.

## Endpoint implemented

- `GET /api/admin/v1/ai-chatbot/foundation`
- `GET|PUT /api/admin/v1/ai-chatbot/integration`
- `POST /api/admin/v1/ai-chatbot/integration/test-connection`
- `POST /api/admin/v1/ai-chatbot/integration/activate`
- `POST /api/admin/v1/ai-chatbot/integration/deactivate`
- `GET|POST /api/admin/v1/ai-chatbot/prompts`
- `POST /api/admin/v1/ai-chatbot/prompts/:promptId/approve`
- `POST /api/admin/v1/ai-chatbot/prompts/:promptId/publish`

Semua mutation memakai session auth, CSRF, rate limit, tenant permission, request
ID, safe error envelope, dan audit. Endpoint activation tersedia sebagai guard
dan selalu menolak activation pada Sprint 1.

## Verifikasi

| Area | Hasil |
|---|---|
| Backend | typecheck source/test, 21 file dan 184 test, build — lulus |
| Frontend | ESLint, typecheck, 13 file dan 64 test, Vite build — lulus |
| Anti-ban | typecheck dan manual suite — lulus |
| Migration smoke | 1 tenant, 2 membership, 1 integration, pgvector aktif — lulus |
| Live readiness | pgvector, Redis, dan object storage reachable; provider belum dikonfigurasi |
| OpenAPI | Redocly syntax/reference lint pada dua spesifikasi — lulus |
| Compose | merged development configuration valid; services healthy |
| Production dependency audit | backend 0, frontend 0; anti-ban 1 High transitive `ip-address<=10.3.0` masih open |

## Gate yang sengaja belum dibuka

- Belum ada retrieval, generation, atau pengiriman jawaban AI ke customer.
- `AI_CHATBOT_ENABLED=true` tetap ditolak saat startup dan
  `effectiveEnabled=false` tetap dipaksakan server-side.
- Provider/model production, secret manager, vector dimension, evaluation
  threshold, retention/privacy policy, serta Product/Medical approval belum
  diputuskan.
- Mapping role reviewer/publisher dan separation of duty final masih menunggu
  Product/Security. Capability granular sudah tersedia, dengan
  `chatbot.manage` sebagai compatibility fallback sementara.
- Temuan dependency anti-ban harus diperbaiki atau diterima secara formal dengan
  owner dan expiry sebelum release gate production.

Sprint berikutnya dapat membangun Knowledge Base di atas tenant, settings,
provider ports, prompt version, dan readiness boundary ini tanpa membuka traffic
customer lebih awal.
