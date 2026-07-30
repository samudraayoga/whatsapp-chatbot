# Sprint 2 Status

## Goal

Operator dapat memahami state koneksi dan melakukan pairing/reconnect tanpa terminal.

## Selesai

- [x] Rich state model: starting, connecting, QR required, connected,
      reconnecting, paused, logged out, bad session, disconnected, shutdown.
- [x] Connected since, last disconnect classification, retry attempt/next retry,
      reconnect eligibility, browser profile, dan credential timestamp.
- [x] Raw QR hanya in-memory, TTL 60 detik, rotate-safe, no-store, dan langsung
      dihapus setelah connected.
- [x] QR tidak lagi dicetak ke terminal atau dimasukkan event/database/log.
- [x] Guarded reconnect dengan single timer dan alasan disabled.
- [x] Terminal disconnect tidak membuat reconnect loop.
- [x] Emergency pause memblokir send baru dan tetap diterapkan pada socket baru.
- [x] Server-Sent Events untuk overview/session dengan fallback polling 10 detik.
- [x] Persistence minimum operational events tanpa secret.
- [x] Session detail page, QR countdown, incident state, reconnect, dan pause UI.
- [x] Viewer dapat membaca state tetapi tidak melihat/memanggil control action.
- [x] Permission, CSRF, mutation rate limit, request ID, dan audit.

## Endpoint

- `GET /api/admin/v1/session`
- `GET /api/admin/v1/session/qr`
- `POST /api/admin/v1/session/reconnect`
- `GET /api/admin/v1/safety/stats`
- `POST /api/admin/v1/safety/pause`
- `GET /api/admin/v1/events/stream`

## Pairing

1. Jalankan backend dan control panel.
2. Login sebagai Operator/Admin.
3. Buka `/operations/session`.
4. Ketika state `qr_required`, scan QR dari WhatsApp → Perangkat Tertaut.
5. QR menghilang otomatis dan state berpindah ke `connected`.

## Guardrail

- Operator/Admin memiliki `session.reconnect` dan `safety.pause`.
- Viewer hanya dapat melihat state.
- `logged_out` dan `bad_session` membutuhkan reset auth oleh Admin; reset sengaja
  belum dibuka sampai step-up authentication tersedia.
- Resume sending tetap scope Safety Center berikutnya.
