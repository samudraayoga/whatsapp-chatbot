# WhatsApp Control Panel

React control panel untuk `simple-whatsapp-chatbot`. Package ini sengaja menjadi sibling dari backend dan `baileys-antiban`.

## Menjalankan development

```bash
npm install
npm run dev
```

Development memakai mock Admin API secara default. Login mock:

```text
username: admin
password: admin123
```

Untuk memakai backend lokal, buat `.env.local`:

```dotenv
VITE_ENABLE_MOCKS=false
```

Vite akan mem-proxy `/api` ke `http://localhost:3000`.

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
update dengan fallback polling 10 detik, guarded reconnect, dan emergency pause.
Action reset/re-pair credential tetap khusus backlog Admin karena membutuhkan
step-up authentication.

Sprint 3 menyediakan:

- Inbox tiga panel pada `/inbox` dengan pencarian, filter, dan cursor pagination.
- Deep-link histori pada `/inbox/:contactId`.
- Contact search/detail pada `/contacts` dengan identity warning.
- Follow-up queue menu `5` pada `/inbox/follow-ups`.
- Claim/resolve follow-up untuk user dengan permission `handoffs.manage`.

Nomor dan JID yang ditampilkan sudah termasking oleh backend. Isi pesan tidak
pernah ditaruh pada URL atau query string.
