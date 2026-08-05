# AI Chatbot Sprint 3 — Searchable Knowledge

Status: **development selesai dan terverifikasi lokal**. Integrasi AI untuk
traffic customer tetap **hard-off** sampai Sprint 4+ dan release gate disetujui.

## Hasil utama

- Sidebar **Integrasi Chatbot AI** tetap memakai namespace terpisah dari rule
  engine lama.
- Knowledge Base sekarang memiliki tab **FAQ & Artikel**, **Documents**, dan
  **Processing Queue**.
- Admin dapat upload PDF, DOCX, TXT, Markdown, dan CSV dengan progress upload,
  kategori, status bertahap, preview ekstraksi, preview chunk, retry/reprocess,
  archive, dan delete sesuai state.
- Backend memakai private S3-compatible object storage, Redis/BullMQ worker,
  extraction/cleaning, heading-aware chunking, deterministic embedding adapter,
  dan PostgreSQL/pgvector.
- Published FAQ/article otomatis masuk antrean indexing; archive menonaktifkan
  chunk. Internal search hanya membaca source active, tenant yang sama,
  published/current, dan masih valid.
- Embedding usage mencatat model, version, input/chunk count, token count, trace
  ID, dan tempat untuk estimated cost tanpa menyimpan credential.

## Guardrail yang tetap berlaku

- `AI_CHATBOT_ENABLED=false` dan `effectiveEnabled=false` tetap wajib.
- API token/provider secret tidak pernah dikirim ke browser atau ditulis ke
  source code/database; aplikasi hanya menyimpan `secret_ref`.
- Tenant selalu berasal dari authenticated server context.
- Audit upload/action tidak menyimpan object key, isi dokumen, atau credential.
- Local/test memakai embedding mock. Belum ada jawaban AI yang dikirim ke
  customer WhatsApp.

## Acceptance Sprint 3

| Kriteria | Bukti | Status |
|---|---|---|
| Dokumen valid sampai `ready` | Live MinIO → BullMQ → extract → chunk → pgvector smoke | Lulus |
| Error aman dan dapat dipahami | Validation/parser errors disanitasi dan disimpan sebagai safe code/message | Lulus |
| Reprocess idempotent | Processing revision + transactional chunk replacement; smoke revision 2 tanpa duplikat | Lulus |
| Source metadata dan embedding tersimpan | Chunk menyimpan source, section, token, model/version, dan vector | Lulus |
| Hanya knowledge valid/active | Search query memfilter tenant, status, current published pointer, dan validity | Lulus |
| Archive menonaktifkan chunk | Document/knowledge archive update chunk ke `inactive`; smoke terverifikasi | Lulus |
| Worker tidak memblokir API | BullMQ worker terpisah dari request processing | Lulus |
| Lima tipe file | Unit fixture PDF/DOCX/TXT/MD/CSV | Lulus |
| Token/cost dapat dicatat | `ai_embedding_usage_logs`; cost nullable sampai pricing dipilih | Lulus |

## Batas yang masih terbuka

- Production embedding provider/model/dimension dan API credential/secret
  manager belum dipilih.
- Malware scanner saat ini baru hook + baseline EICAR detection; scanner formal,
  parser sandbox/resource limits, object-storage KMS, retention, dan deletion
  policy wajib selesai sebelum production.
- Queue dashboard, autoscaling, timeout/capacity benchmark, golden corpus, dan
  Recall@K evaluation masih pekerjaan platform/AI berikutnya.
- Customer retrieval/generation, strict-grounded answer, source trace, safety
  validator, dan fallback adalah scope Sprint 4–5.

## Menjalankan lokal

```bash
cd simple-whatsapp-chatbot
npm run dev:ai:infra
npm run test:smoke:ai-documents
```

`npm run dev`/`npm run dev:ai` dan container app menjalankan migration
idempotent saat startup.

Konfigurasi lokal ada di `.env.example`. Untuk production, isi object-storage
credential melalui deployment secret/secret manager—jangan commit token ke
repository.
