# Control Panel Contract

Dokumen dalam folder ini dimulai pada Sprint 0 dan menjadi kontrak aktif control plane:

- `openapi.yaml`: kontrak awal `/api/admin/v1`.
- `architecture-decisions.md`: keputusan auth, RBAC, API, realtime, dan capability boundary.
- `data-model.md`: rancangan outbox, audit, session, identity, dan handoff.
- `threat-model.md`: aset, trust boundary, ancaman, dan kontrol minimum.

## Status Sprint 3

Identity, operations, dan read model berikut sudah diimplementasikan:

- `POST /api/admin/v1/auth/login`
- `GET /api/admin/v1/me`
- `POST /api/admin/v1/auth/logout`
- `GET /api/admin/v1/overview`
- `GET /api/admin/v1/session`
- `GET /api/admin/v1/session/qr`
- `POST /api/admin/v1/session/reconnect`
- `GET /api/admin/v1/safety/stats`
- `POST /api/admin/v1/safety/pause`
- `GET /api/admin/v1/events/stream`
- `GET /api/admin/v1/conversations`
- `GET /api/admin/v1/conversations/{conversationId}/messages`
- `GET /api/admin/v1/contacts`
- `GET /api/admin/v1/contacts/{contactId}`
- `GET /api/admin/v1/handoffs`
- `POST /api/admin/v1/handoffs/{handoffId}/assign`
- `POST /api/admin/v1/handoffs/{handoffId}/resolve`
- `GET /health/live`
- `GET /health/ready`

Endpoint Sprint 4+ pada OpenAPI masih draft. Endpoint compatibility `/health`,
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
