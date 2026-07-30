# Sprint 3 Status

## Goal

Operator dapat mencari contact dan menelusuri histori pesan.

## Selesai

- [x] Inbox tiga panel dengan search nama/nomor dan filter operational.
- [x] Deep-link percakapan `/inbox/:contactId` tanpa message content di URL.
- [x] Histori newest-first dari API, ditampilkan kronologis dengan cursor untuk
      memuat pesan lebih lama.
- [x] Bubble incoming/outgoing, status, timestamp, dan detail teknis.
- [x] Placeholder eksplisit untuk message type yang belum didukung.
- [x] Contacts search/detail dengan phone dan JID termasking.
- [x] Identity facade `resolved`, `unresolved`, dan `conflict`; unresolved/conflict
      tidak di-merge otomatis.
- [x] Follow-up menu `5` dibuat exactly-once berdasarkan source message.
- [x] Follow-up queue dengan claim/resolve, permission, CSRF, rate limit, dan audit.
- [x] Stable cursor pagination dan index timeline untuk query utama.
- [x] Search wildcard di-escape dan seluruh nilai query diparameterisasi.

## Endpoint

- `GET /api/admin/v1/conversations`
- `GET /api/admin/v1/conversations/:conversationId/messages`
- `GET /api/admin/v1/contacts`
- `GET /api/admin/v1/contacts/:contactId`
- `GET /api/admin/v1/handoffs`
- `POST /api/admin/v1/handoffs/:handoffId/assign`
- `POST /api/admin/v1/handoffs/:handoffId/resolve`

## UI

- `/inbox`
- `/inbox/:contactId`
- `/inbox/follow-ups`
- `/contacts`
- `/contacts/:contactId`

## Guardrail

- Read endpoint membutuhkan `messages.read` dan/atau `contacts.read`.
- Claim/resolve membutuhkan `handoffs.manage`.
- Nomor dan JID tidak pernah dikirim utuh oleh read model.
- Raw message content tidak masuk query string, route, audit, atau operational event.
- Identity conflict hanya ditandai untuk review; tidak ada auto-merge.
