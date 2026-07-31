# WhatsApp Control Panel

React control panel untuk `simple-whatsapp-chatbot`. Package ini sengaja menjadi sibling dari backend dan `baileys-antiban`.

## Menjalankan development

```bash
npm install
npm run dev
```

Development selalu memakai Admin API asli. Vite mem-proxy `/api` ke
`http://localhost:3000`, jadi backend harus sudah berjalan sebelum login.
Mock/fixture hanya dimuat oleh Vitest melalui MSW dan tidak tersedia sebagai
mode runtime aplikasi.

## Validasi

```bash
npm run check
```

## Security boundary

- Browser hanya memanggil `/api/admin/v1`.
- Authentication produksi harus memakai secure HttpOnly session cookie.
- Jangan menaruh `API_KEY`, database credential, WhatsApp auth, atau secret webhook dalam variable `VITE_*`.
- `baileys-antiban` hanya diakses oleh backend melalui operational facade.

Sprint 2 menyediakan rich session page, QR pairing dengan countdown, live SSE
update dengan fallback polling 10 detik, guarded reconnect, emergency pause,
dan reset/re-pair credential khusus Admin. Reset memerlukan CSRF, permission
`session.reset`, password saat ini, alasan, serta typed confirmation sebelum
backend menghapus credential WhatsApp dan membuat QR baru.

Sprint 3 menyediakan:

- Inbox tiga panel pada `/inbox` dengan pencarian, filter, dan cursor pagination.
- Deep-link histori pada `/inbox/:contactId`.
- Contact search/detail pada `/contacts` dengan identity warning.
- Follow-up queue menu `5` pada `/inbox/follow-ups`.
- Claim/resolve follow-up untuk user dengan permission `handoffs.manage`.

Nomor dan JID yang ditampilkan sudah termasking oleh backend. Isi pesan tidak
pernah ditaruh pada URL atau query string.

Sprint 4 menyediakan:

- Safe composer di thread dan `/messages/compose`.
- Preflight session, safety risk, rate budget, dan character limit 4.096.
- Durable outbox pada `/messages/outbox`.
- Message timeline pada `/messages/:messageId`.
- Cancel untuk item yang belum sending dan controlled retry untuk known failure.
- `unknown_outcome` recovery UX tanpa blind retry.
- Admin reconciliation untuk confirmed sent/not-sent dengan catatan audit.

Response `202 Accepted` hanya berarti command sudah durable di PostgreSQL,
bukan berarti WhatsApp sudah menerima pesan.

Sprint 5 menyediakan:

- Version history dan rule editor di `/chatbot/rules`, khusus permission
  `chatbot.manage`.
- Draft copy dari active version; version published/archived tidak dapat diedit.
- Validasi trigger, unique priority, empty rule, fallback, response, dan action.
- Dry-run exact-normalized tanpa mengirim pesan WhatsApp.
- Guarded publish dan rollback dengan summary/reason serta phrase confirmation.
- Contract test memakai fixture terisolasi; workflow runtime selalu memakai backend.

Sprint 6 menyediakan:

- Safety Center pada `/operations/safety`.
- Blocker/delay reason dan rekomendasi yang dapat ditelusuri ke message timeline.
- Health, rate, warm-up, timelock, recovery, delivery, retry/reconnect, dan
  capability state yang eksplisit.
- Emergency pause untuk Operator.
- Guarded resume untuk Admin dengan alasan, password saat ini, dan acknowledgement.
- Reset default-off dengan feature flag, eligibility, password, alasan, dan typed
  confirmation.
- Preset `conservative` read-only; UI tidak membaca atau mengubah file JSON
  internal `baileys-antiban`.
