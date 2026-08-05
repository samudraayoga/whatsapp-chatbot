# Integrasi Chatbot AI RAHO — Sprint 6 Admin Operations Beta

Folder ini adalah source of truth sampai Sprint 6 untuk fitur RAG **Integrasi Chatbot
AI**. Dokumen ini melengkapi, bukan menggantikan, kontrak control panel existing.

## Batas domain

| Domain | UI namespace | API namespace | Status baseline |
|---|---|---|---|
| Rule engine deterministik existing | `/chatbot/rules` | `/api/admin/v1/chatbot/*` | Implemented |
| Integrasi Chatbot AI/RAG | `/ai-chatbot/*` | `/api/admin/v1/ai-chatbot/*` | Sprint 6 internal operations implemented; customer WhatsApp cutover hard-off |

Kedua domain tidak boleh memakai route atau konfigurasi aktif yang sama. RAG
baru harus default-off dan tidak boleh mengambil alih traffic sampai release
gate yang sesuai lulus.

## UI route map

| Menu | Route | Baseline status |
|---|---|---|
| Integrasi Chatbot AI entry | `/ai-chatbot` → overview view | Implemented |
| Overview | `/ai-chatbot/overview` | Implemented foundation page |
| Knowledge Base | `/ai-chatbot/knowledge` | Implemented FAQ/article governance, Documents, Processing Queue, preview, re-index, and internal search |
| AI Instructions | `/ai-chatbot/instructions` | Implemented immutable draft/approve/publish workflow |
| Testing Playground | `/ai-chatbot/playground` | Prompt selection, context, save/run/batch test cases, scoring, and before/after implemented |
| Handoff Queue | `/ai-chatbot/handoffs` | Sprint 5 AI metadata and operator workflow implemented |
| Conversation Logs | `/ai-chatbot/conversations` | Filtered trace/source/tokens/latency timeline, feedback, and limited masked CSV implemented |
| Unanswered Questions | `/ai-chatbot/unanswered` | Exact aggregation, review states, conversation link, and create-draft-FAQ implemented |
| Analytics | `/ai-chatbot/analytics` | Implemented placeholder; feature planned Sprint 7 |
| Settings | `/ai-chatbot/settings` | Implemented redacted settings, readiness, and connection test |

Route skeleton tetap kompatibel dengan permission `chatbot.manage`, sedangkan
API menegakkan capability `ai.settings.*`, `ai.prompts.*`, `ai.logs.read`,
`ai.feedback.manage`, `ai.unanswered.manage`, `ai.evaluations.manage`, dan
`knowledge.*` dari authenticated tenant membership. Handoff page baru adalah view AI-specific atas existing
handoff source of truth/API; ia tidak membuat tabel atau queue paralel.

Subroute Tambah FAQ/Artikel tersedia sebagai editor operasional. Categories,
Documents, dan Processing Queue tersedia di halaman Knowledge Base. Dokumen
PDF, DOCX, TXT, MD, dan CSV dapat diunggah, diproses ulang, diarsipkan, dilihat
preview/chunk-nya, dan diuji melalui pencarian vector internal.

Backend sampai Sprint 6 menyediakan endpoint foundation/settings/prompt di atas,
ditambah:

```http
GET /api/admin/v1/ai-chatbot/foundation
GET|PUT /api/admin/v1/ai-chatbot/integration
POST /api/admin/v1/ai-chatbot/integration/test-connection
POST /api/admin/v1/ai-chatbot/integration/activate
POST /api/admin/v1/ai-chatbot/integration/deactivate
GET|POST /api/admin/v1/ai-chatbot/prompts
POST /api/admin/v1/ai-chatbot/prompts/{promptId}/approve
POST /api/admin/v1/ai-chatbot/prompts/{promptId}/publish
GET|POST /api/admin/v1/ai-chatbot/categories
PUT|DELETE /api/admin/v1/ai-chatbot/categories/{categoryId}
GET|POST /api/admin/v1/ai-chatbot/knowledge
GET|PUT|DELETE /api/admin/v1/ai-chatbot/knowledge/{knowledgeId}
POST /api/admin/v1/ai-chatbot/knowledge/{knowledgeId}/submit-review
POST /api/admin/v1/ai-chatbot/knowledge/{knowledgeId}/request-revision
POST /api/admin/v1/ai-chatbot/knowledge/{knowledgeId}/approve
POST /api/admin/v1/ai-chatbot/knowledge/{knowledgeId}/publish
POST /api/admin/v1/ai-chatbot/knowledge/{knowledgeId}/archive
POST /api/admin/v1/ai-chatbot/knowledge/bulk-action
POST /api/admin/v1/ai-chatbot/knowledge/{knowledgeId}/reindex
GET /api/admin/v1/ai-chatbot/documents
POST /api/admin/v1/ai-chatbot/documents/upload
GET|DELETE /api/admin/v1/ai-chatbot/documents/{documentId}
GET /api/admin/v1/ai-chatbot/documents/{documentId}/preview
POST /api/admin/v1/ai-chatbot/documents/{documentId}/process
POST /api/admin/v1/ai-chatbot/documents/{documentId}/reprocess
POST /api/admin/v1/ai-chatbot/documents/{documentId}/archive
POST /api/admin/v1/ai-chatbot/knowledge/search-test
POST /api/admin/v1/ai-chatbot/playground/test
GET|POST /api/admin/v1/ai-chatbot/playground/test-cases
PUT /api/admin/v1/ai-chatbot/playground/test-cases/{testCaseId}
POST /api/admin/v1/ai-chatbot/playground/test-cases/{testCaseId}/run
POST /api/admin/v1/ai-chatbot/playground/test-cases/run-batch
GET /api/admin/v1/ai-chatbot/conversations
GET /api/admin/v1/ai-chatbot/conversations/{conversationId}
GET /api/admin/v1/ai-chatbot/conversations/{conversationId}/messages
GET /api/admin/v1/ai-chatbot/conversations/export.csv
POST /api/admin/v1/ai-chatbot/messages/{traceId}/feedback
GET /api/admin/v1/ai-chatbot/unanswered
PUT /api/admin/v1/ai-chatbot/unanswered/{unansweredId}
POST /api/admin/v1/ai-chatbot/unanswered/{unansweredId}/create-knowledge
POST /api/admin/v1/ai-chatbot/unanswered/{unansweredId}/ignore
POST /api/admin/v1/ai-chatbot/unanswered/{unansweredId}/resolve
POST /api/admin/v1/ai-chatbot/runtime/respond
```

Integration responses menggabungkan redacted configuration dan live dependency
probe. Provider port memiliki deterministic mock untuk test/development; provider
yang tidak terdaftar tidak dipilih diam-diam. Endpoint activation sengaja selalu
fail-closed pada Sprint 1, sehingga belum ada provider call dari traffic customer.
Publish sekarang mengantrekan indexing versi published. Worker BullMQ mengambil
file private dari object storage, mengekstrak dan membersihkan teks, membuat
chunk, menghasilkan embedding melalui adapter, lalu menyimpan vector secara
idempotent. Archive menonaktifkan chunk agar tidak ikut hasil pencarian.

Sprint 6 tetap memaksa `effectiveEnabled=false`. Startup menolak
`AI_CHATBOT_ENABLED=true`, dan activation service menolak aktivasi sampai safety,
evaluation, serta approval customer release tersedia.

Local development infrastructure dapat dibootstrap secara idempotent dengan
`npm run dev:ai:infra`. Readiness memeriksa PostgreSQL/pgvector, Redis,
MinIO, dan provider adapter secara live. Queue worker dan document client sudah
aktif bila dependency dikonfigurasi. Local/test dapat memakai mock. Adapter
`openai-compatible` dapat memakai API nyata melalui secret reference
backend. Safe Playground menjalankan normalization, safety pre-check, bounded
memory, embedding, tenant/status/
validity-filtered Top-K, bounded context, structured generation, strict
grounding, deterministic output validation, disclaimer, interest/admin detection,
configured fallback, idempotent handoff, serta source/token/latency/safety trace.
Direct customer WhatsApp cutover dan production/medical approval tetap menunggu
release gate berikutnya.

## Scope MVP

- Settings integrasi AI dan prompt/instruction version.
- Knowledge category, FAQ, artikel, dokumen, approval, publish, dan archive.
- Document processing, chunking, embedding, dan vector retrieval.
- Strict-grounded response generation dan structured output.
- Safety pre-check, output validation, fallback, dan human handoff.
- Testing Playground, conversation logs, unanswered questions, analytics, dan
  auditability.

## Non-goal MVP

- Booking atau reservasi otomatis.
- Pembayaran atau transaksi.
- Diagnosis, resep, perubahan obat, rekomendasi medis personal, atau janji hasil.
- Jawaban bebas dari pengetahuan umum model ketika context resmi tidak cukup.
- Fine-tuning, multi-agent, broadcast, dan multi-channel tambahan.

## Prinsip wajib

1. Knowledge published dan valid adalah satu-satunya sumber fakta jawaban.
2. Retrieval selalu dibatasi tenant yang berasal dari server context.
3. No context atau low confidence menghasilkan fallback; model tidak menebak.
4. Output tidak dikirim sebelum schema dan safety validation lulus.
5. Pertanyaan darurat, permintaan admin, dan minat customer dapat membuat
   handoff pada **existing `handoff_tasks`**.
6. Provider credential tidak pernah dikirim ke browser atau disimpan di
   knowledge, prompt, log, maupun source code.
7. Setiap respons dapat ditelusuri ke message, tenant, knowledge/version,
   prompt version, model, score, token, latency, dan trace ID.

## Status vocabulary

- `implemented`: tersedia dan diverifikasi pada codebase.
- `documented`: keputusan/kontrak tersedia tanpa implementasi.
- `planned`: backlog sprint berikutnya.
- `blocked`: membutuhkan keputusan atau dependency eksternal.

`x-implementation-status` pada OpenAPI memakai vocabulary yang sama. Draft
kontrak bukan bukti endpoint telah tersedia.

## Dokumen

- `architecture-decisions.md`: keputusan dan keputusan terbuka.
- `architecture.md`: context/container diagram dan sequence flow.
- `data-model.md`: logical ERD dan migration boundary.
- `openapi.yaml`: kontrak awal Admin API AI.
- `delivery-plan.md`: backlog, ownership, DoR/DoD, dan release gate.
- `quality-plan.md`: test strategy, RTM, severity, dan acceptance skeleton.
- `threat-model.md`: aset, trust boundary, ancaman, dan kontrol.
- `risk-register.md`: risiko delivery dan mitigasi.

## Sumber

Artefak disusun dari:

- `BLUEPRINT_INTEGRASI_CHATBOT_AI_RAHO.md`;
- `BLUEPRINT_DEVELOPMENT_INTEGRASI_CHATBOT_AI_RAHO.md`;
- boundary dan capability yang benar-benar tersedia pada repository saat Sprint
  0 dimulai.

Bila blueprint dan implementasi existing berbeda, keputusan eksplisit dalam
`architecture-decisions.md` berlaku untuk integrasi ini sampai ADR baru
menggantikannya.
