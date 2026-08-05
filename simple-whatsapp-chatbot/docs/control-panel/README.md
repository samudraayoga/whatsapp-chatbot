# Control Panel Contract

Dokumen dalam folder ini dimulai pada Sprint 0 dan menjadi kontrak aktif control plane:

- `openapi.yaml`: kontrak awal `/api/admin/v1`.
- `architecture-decisions.md`: keputusan auth, RBAC, API, realtime, dan capability boundary.
- `data-model.md`: rancangan outbox, audit, session, identity, dan handoff.
- `threat-model.md`: aset, trust boundary, ancaman, dan kontrol minimum.

Kontrak khusus fitur RAG baru berada di `../ai-chatbot/`. Fitur ini memakai
namespace `/api/admin/v1/ai-chatbot` dan tidak menggantikan rule engine
deterministik `/api/admin/v1/chatbot`.

## Status Sprint 6

Identity, operations, dan read model berikut sudah diimplementasikan:

- `POST /api/admin/v1/auth/login`
- `GET /api/admin/v1/me`
- `POST /api/admin/v1/auth/logout`
- `GET /api/admin/v1/overview`
- `GET /api/admin/v1/session`
- `GET /api/admin/v1/session/qr`
- `POST /api/admin/v1/session/reconnect`
- `GET /api/admin/v1/safety/stats`
- `GET /api/admin/v1/safety/metrics`
- `POST /api/admin/v1/safety/pause`
- `POST /api/admin/v1/safety/resume`
- `POST /api/admin/v1/safety/reset` (feature flag + recovery guard)
- `GET /api/admin/v1/events/stream`
- `GET /api/admin/v1/conversations`
- `GET /api/admin/v1/conversations/{conversationId}/messages`
- `GET /api/admin/v1/contacts`
- `GET /api/admin/v1/contacts/{contactId}`
- `GET /api/admin/v1/handoffs`
- `POST /api/admin/v1/handoffs/{handoffId}/assign`
- `POST /api/admin/v1/handoffs/{handoffId}/resolve`
- `POST /api/admin/v1/messages`
- `GET /api/admin/v1/messages/{messageId}`
- `GET /api/admin/v1/outbox`
- `POST /api/admin/v1/outbox/{outboxId}/cancel`
- `POST /api/admin/v1/outbox/{outboxId}/retry`
- `POST /api/admin/v1/outbox/{outboxId}/reconcile`
- `GET /api/admin/v1/chatbot/config`
- `PUT /api/admin/v1/chatbot/config`
- `POST /api/admin/v1/chatbot/test`
- `GET /api/admin/v1/ai-chatbot/foundation` (Sprint 0, read-only)
- `/api/admin/v1/ai-chatbot/integration*` dan `/prompts*` (Sprint 1)
- `/api/admin/v1/ai-chatbot/categories*` dan `/knowledge*` (Sprint 2)
- `/api/admin/v1/ai-chatbot/documents*`, `/knowledge/*/reindex`, dan
  `/knowledge/search-test` (Sprint 3)
- `/api/admin/v1/ai-chatbot/playground/test` dan
  `/api/admin/v1/ai-chatbot/runtime/respond` (Sprint 4 Alpha; customer cutover off)
- `GET /health/live`
- `GET /health/ready`

Endpoint Sprint 7+ pada OpenAPI masih draft. Endpoint compatibility `/health`,
`/api/whatsapp/status`, dan `/api/messages/send` tetap tersedia.

Breaking change pada kontrak harus:

1. memperbarui `openapi.yaml`;
2. memperbarui schema/fixture di `whatsapp-control-panel/src/api`;
3. menambah atau memperbarui contract test;
4. mencatat alasan perubahan pada pull request atau ADR.

## Prinsip

- Browser hanya berbicara dengan Admin API/BFF.
- API key existing tidak pernah dikirim ke browser.
- Semua waktu menggunakan ISO-8601 UTC.
- Semua response JSON memiliki `requestId`.
- Mutation operasional menggunakan CSRF protection, permission server-side, dan audit.
- Message create menggunakan `Idempotency-Key`.
- Modul yang belum aktif mengembalikan capability state, bukan angka nol yang menyesatkan.
