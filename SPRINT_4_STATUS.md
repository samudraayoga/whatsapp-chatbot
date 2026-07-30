# Sprint 4 Status

## Goal

Semua pesan dari control panel idempotent, durable, dan dapat ditelusuri.

## Selesai

- [x] Safe composer di Inbox dan standalone Compose page.
- [x] Normalisasi line break, validation 1–4.096 karakter, priority, dan schedule.
- [x] Preflight readiness, blocker, session, risk, dan rate budget.
- [x] Satu idempotency key per logical submit; timeout/replay mempertahankan key.
- [x] Replay key + payload sama mengembalikan logical message/outbox yang sama.
- [x] Key sama + payload berbeda menghasilkan `409 IDEMPOTENCY_CONFLICT`.
- [x] PostgreSQL transaction membuat logical message, outbox, idempotency record,
      dan event sebelum API mengembalikan `202 Accepted`.
- [x] Worker memakai row lock `SKIP LOCKED`, lease, exponential backoff, dan max attempt.
- [x] PostgreSQL outbox menjadi satu-satunya durable source of truth control panel.
- [x] Provider ID dan setiap lifecycle transition dipersist.
- [x] Stale lease/provider ambiguity menjadi `unknown_outcome`, bukan blind retry.
- [x] Cancel hanya untuk queued/scheduled/retrying/safety-delayed.
- [x] Controlled retry hanya untuk known `failed` dan mempertahankan logical lineage.
- [x] Cancel/retry dilindungi permission, CSRF, rate limit, dan audit.
- [x] Outbox tabs/table dan immutable message event timeline.

## Endpoint

- `POST /api/admin/v1/messages`
- `GET /api/admin/v1/messages/:messageId`
- `GET /api/admin/v1/outbox`
- `POST /api/admin/v1/outbox/:outboxId/cancel`
- `POST /api/admin/v1/outbox/:outboxId/retry`
- `POST /api/admin/v1/outbox/:outboxId/reconcile`

## UI

- `/inbox/:contactId` — composer dalam thread.
- `/messages/compose` — standalone safe compose.
- `/messages/outbox` — durable queue dan operator actions.
- `/messages/:messageId` — logical message dan immutable timeline.

## Safety semantics

- `202 Accepted` berarti command sudah durable, bukan sudah terkirim.
- Error setelah provider call dimulai dianggap ambigu.
- `unknown_outcome` tidak dapat di-retry melalui endpoint controlled retry.
- Reconciliation unknown outcome hanya tersedia untuk Admin dan wajib memiliki
  catatan audit; konfirmasi sent juga wajib menyertakan provider message ID.
- Stale worker lease tidak pernah otomatis menyebabkan provider send kedua.
- Endpoint legacy `/api/messages/send` tetap untuk compatibility dan tidak dipakai UI.
