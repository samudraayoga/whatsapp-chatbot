# AI Chatbot RAHO — Sprint 2 Status

Tanggal verifikasi: 5 Agustus 2026  
Status engineering: **Selesai**  
Status customer runtime: **Hard-off / belum dirilis**

## Hasil Sprint 2

- Knowledge Base operasional di menu kiri **Integrasi Chatbot AI**, dengan list,
  pencarian, filter, pagination, status, category manager, serta editor FAQ dan
  artikel.
- Empat tabel tenant-scoped: `knowledge_categories`, `knowledge_items`,
  `knowledge_item_versions`, dan `knowledge_question_variants`.
- Dua belas kategori baseline di-seed secara idempotent untuk tenant bootstrap.
- Lifecycle Draft → Review → Approved → Published → Archived, termasuk request
  revision dan bulk publish/archive yang transaksional.
- Published version immutable. Edit pada item published membuat draft versi
  berikutnya tanpa menghilangkan published version yang masih aktif.
- Optimistic concurrency untuk category dan draft version; satu published
  version per item ditegakkan oleh database.
- Normalisasi NFKC/lowercase/whitespace untuk question variants, SHA-256 content
  fingerprint, bounded tags/metadata, dan penolakan raw HTML/javascript sebelum
  penyimpanan.
- Capability `knowledge.read`, `knowledge.edit`, `knowledge.review`,
  `knowledge.publish`, dan `knowledge.categories.manage`, dengan tenant context
  server-side, CSRF, rate limiting, dan audit yang tidak menyimpan content atau
  internal notes.
- OpenAPI standalone AI dan Admin API gabungan, frontend runtime schema, mocks,
  dan dokumentasi Sprint 2 telah disinkronkan.

## Endpoint implemented

- `GET|POST /api/admin/v1/ai-chatbot/categories`
- `PUT|DELETE /api/admin/v1/ai-chatbot/categories/:categoryId`
- `GET|POST /api/admin/v1/ai-chatbot/knowledge`
- `GET|PUT|DELETE /api/admin/v1/ai-chatbot/knowledge/:knowledgeId`
- `POST /api/admin/v1/ai-chatbot/knowledge/:knowledgeId/submit-review`
- `POST /api/admin/v1/ai-chatbot/knowledge/:knowledgeId/request-revision`
- `POST /api/admin/v1/ai-chatbot/knowledge/:knowledgeId/approve`
- `POST /api/admin/v1/ai-chatbot/knowledge/:knowledgeId/publish`
- `POST /api/admin/v1/ai-chatbot/knowledge/:knowledgeId/archive`
- `POST /api/admin/v1/ai-chatbot/knowledge/bulk-action`

## Verifikasi

| Area | Hasil |
|---|---|
| Backend | typecheck source/test, 23 file dan 196 test, build — lulus |
| Frontend | ESLint, typecheck, 13 file dan 68 test, Vite build — lulus |
| Anti-ban | typecheck dan manual suite — lulus |
| Migration/database | 4 tabel knowledge dan 12 kategori seed — lulus |
| Lifecycle smoke | Draft → Published → draft v2; published v1 tetap aktif; rollback bersih — lulus |
| OpenAPI | Dua spesifikasi valid; hanya 22 warning tag-description existing |
| Compose | Konfigurasi valid; PostgreSQL, Redis, dan MinIO healthy |
| Production dependency audit | Backend 0, frontend 0; anti-ban 1 High transitive `ip-address<=10.3.0` masih open |
| Whitespace/diff | `git diff --check` — lulus |

## Gate yang sengaja belum dibuka

- Sprint 2 belum membuat chunk, embedding, vector index, atau retrieval. Pipeline
  tersebut adalah scope Sprint 3.
- Belum ada generation atau pengiriman jawaban AI ke customer.
- `AI_CHATBOT_ENABLED=true` tetap ditolak saat startup dan
  `effectiveEnabled=false` tetap dipaksakan server-side.
- Knowledge Owner dan Medical Reviewer belum menyetujui taxonomy/content
  production maupun disclaimer medis.
- Preset role dan separation of duty reviewer/publisher final masih membutuhkan
  keputusan Product/Security; capability teknisnya sudah terpisah.
- Temuan dependency anti-ban harus diperbaiki atau diterima formal dengan owner
  dan expiry sebelum release production.

Sprint 3 dapat menambahkan upload dokumen, extraction, chunking, queue, embedding,
dan indexing di atas published-version pointer serta validity filter ini tanpa
membuka traffic customer lebih awal.
