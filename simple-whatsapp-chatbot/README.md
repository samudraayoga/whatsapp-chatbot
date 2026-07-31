# simple-whatsapp-chatbot

Backend chatbot WhatsApp sederhana untuk MVP local development dengan Node.js 22, TypeScript, Express, Baileys, PostgreSQL, `pg`, Docker, dan Docker Compose.

## Fitur

- Menampilkan QR pairing ephemeral melalui control panel terautentikasi.
- Menyimpan session WhatsApp di volume Docker agar tidak perlu scan ulang setiap restart.
- Menerima pesan WhatsApp personal.
- Membalas otomatis dengan rule chatbot sederhana.
- Menyimpan pesan incoming dan outgoing ke PostgreSQL.
- Mengirim pesan WhatsApp melalui REST API yang dilindungi API key.
- Menyediakan Admin API dengan session cookie, RBAC, CSRF, audit, dan login throttling.
- Menyediakan liveness, readiness, dan operational overview untuk control panel.
- Menyediakan pencarian contact, histori pesan cursor-paginated, identity warning,
  dan human follow-up queue untuk pilihan menu `5`.
- Menyediakan safe compose dengan idempotency key, PostgreSQL durable outbox,
  worker lease/backoff, guarded cancel/retry, dan immutable message timeline.
- Menyediakan chatbot rules berversi dengan draft validation, dry-run,
  guarded publish/rollback, audit, dan active runtime cache.

## Struktur Project

```text
simple-whatsapp-chatbot/
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── controllers/
│   │   └── message.controller.ts
│   ├── database/
│   │   ├── connection.ts
│   │   └── migrate.ts
│   ├── middleware/
│   │   ├── api-key.middleware.ts
│   │   └── error.middleware.ts
│   ├── routes/
│   │   ├── health.route.ts
│   │   ├── message.route.ts
│   │   └── whatsapp.route.ts
│   ├── services/
│   │   ├── chatbot.service.ts
│   │   ├── message.service.ts
│   │   └── whatsapp.service.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   └── phone.ts
│   ├── app.ts
│   └── server.ts
├── auth/
│   └── .gitkeep
├── .dockerignore
├── .env.example
├── .gitignore
├── compose.yaml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

## Persyaratan

- Docker Desktop sudah berjalan.
- WhatsApp tersedia di HP.
- Port `3000` dan `5432` tidak sedang digunakan.

## Environment Variable

Salin `.env.example` menjadi `.env`.

```env
NODE_ENV=development
PORT=3000

POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_DB=whatsapp_chatbot
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

API_KEY=development-secret-key
WA_AUTH_PATH=./auth

ADMIN_BOOTSTRAP_USERNAME=admin
ADMIN_BOOTSTRAP_PASSWORD=admin123
ADMIN_BOOTSTRAP_DISPLAY_NAME=Local Admin
ADMIN_SESSION_TTL_HOURS=8
SAFETY_RESET_ENABLED=false
```

Ganti bootstrap password untuk environment selain local. Pada `NODE_ENV=production`,
`ADMIN_BOOTSTRAP_PASSWORD` wajib diisi. Nilai ini hanya membuat user pertama dan
tidak merotasi password user yang sudah ada.

## Menjalankan Aplikasi

### Development — direkomendasikan

Satu perintah ini otomatis menyalakan PostgreSQL lewat Docker, menunggu sampai
healthy, kemudian menjalankan backend dengan hot reload:

```bash
npm run dev
```

Backend tersedia di `http://localhost:3000`. PostgreSQL tetap berjalan ketika
backend dihentikan dengan `Ctrl+C`. Untuk menghentikan database:

```bash
npm run dev:stop
```

Docker Desktop harus sudah aktif dan `.env` memakai:

```dotenv
POSTGRES_HOST=localhost
```

### Seluruh backend di Docker

```bash
cp .env.example .env
docker compose up --build
```

Compose otomatis mengganti `POSTGRES_HOST` menjadi `db` untuk container app.

Setelah itu:

1. Tunggu PostgreSQL menjadi healthy.
2. Jalankan package sibling `whatsapp-control-panel`.
3. Login lalu buka menu **Operations**.
4. Buka WhatsApp di HP dan masuk ke menu **Perangkat Tertaut**.
5. Scan QR ephemeral yang tampil di control panel.
6. Tunggu state berubah menjadi `connected`.

## Menguji Health Check

```bash
curl http://localhost:3000/health
```

Probe baru:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
```

Contoh response:

```json
{
  "success": true,
  "service": "simple-whatsapp-chatbot",
  "database": "connected",
  "whatsapp": "connected"
}
```

## Menguji Status WhatsApp

```bash
curl http://localhost:3000/api/whatsapp/status
```

## Menguji Kirim Pesan

```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: development-secret-key" \
  -d '{
    "phone": "6281234567890",
    "message": "Halo dari REST API"
  }'
```

## Menguji Chatbot

Kirim pesan WhatsApp langsung ke akun yang terhubung:

- `ping` akan dibalas `pong`
- `halo`, `hai`, `hello` akan dibalas sapaan
- `menu` akan menampilkan daftar perintah
- `jam` akan menampilkan waktu server

Pesan selain itu akan dibalas dengan pesan fallback.

## Melihat Log

```bash
docker compose logs -f app
```

## Menghentikan Aplikasi

```bash
docker compose down
```

## Menghapus Database dan Session WhatsApp

Perintah berikut akan menghapus data PostgreSQL dan session WhatsApp:

```bash
docker compose down -v
```

## Logout atau Scan Ulang WhatsApp

1. Hentikan container:

```bash
docker compose down
```

2. Hapus hanya volume authentication WhatsApp:

```bash
docker volume rm simple-whatsapp-chatbot_whatsapp_auth
```

Jika nama project Compose berbeda, cek nama volume lebih dulu:

```bash
docker volume ls | grep whatsapp_auth
```

3. Jalankan ulang aplikasi:

```bash
docker compose up --build
```

4. Scan QR baru saat QR muncul kembali.

## Endpoint

### Admin API Sprint 1–6

- `POST /api/admin/v1/auth/login`
- `GET /api/admin/v1/me`
- `POST /api/admin/v1/auth/logout`
- `GET /api/admin/v1/overview`
- `GET /api/admin/v1/session`
- `GET /api/admin/v1/session/qr`
- `POST /api/admin/v1/session/reconnect`
- `POST /api/admin/v1/session/reset`
- `GET /api/admin/v1/safety/stats`
- `GET /api/admin/v1/safety/metrics`
- `POST /api/admin/v1/safety/pause`
- `POST /api/admin/v1/safety/resume`
- `POST /api/admin/v1/safety/reset`
- `GET /api/admin/v1/events/stream`
- `GET /api/admin/v1/conversations`
- `GET /api/admin/v1/conversations/:conversationId/messages`
- `GET /api/admin/v1/contacts`
- `GET /api/admin/v1/contacts/:contactId`
- `GET /api/admin/v1/handoffs`
- `POST /api/admin/v1/handoffs/:handoffId/assign`
- `POST /api/admin/v1/handoffs/:handoffId/resolve`
- `POST /api/admin/v1/messages`
- `GET /api/admin/v1/messages/:messageId`
- `GET /api/admin/v1/outbox`
- `POST /api/admin/v1/outbox/:outboxId/cancel`
- `POST /api/admin/v1/outbox/:outboxId/retry`
- `POST /api/admin/v1/outbox/:outboxId/reconcile`
- `GET /api/admin/v1/chatbot/versions`
- `POST /api/admin/v1/chatbot/versions/drafts`
- `GET /api/admin/v1/chatbot/versions/:versionId`
- `PUT /api/admin/v1/chatbot/versions/:versionId/rules`
- `POST /api/admin/v1/chatbot/test`
- `POST /api/admin/v1/chatbot/versions/:versionId/publish`
- `POST /api/admin/v1/chatbot/versions/:versionId/rollback`

Browser memakai opaque `admin_session` cookie. Cookie session bersifat `HttpOnly`;
mutation juga wajib mengirim cookie `admin_csrf` melalui header `X-CSRF-Token`.
Kontrak lengkap ada di `docs/control-panel/openapi.yaml`.

Safety reset sengaja nonaktif secara default. Untuk mengaktifkannya pada
environment terkontrol, set `SAFETY_RESET_ENABLED=true`. Endpoint tetap
memerlukan Admin, password saat ini, alasan, typed confirmation, health low,
serta recovery/timelock yang sudah clear. Setelah reset, sending tetap paused
hingga resume terpisah berhasil.

### `GET /health`

Response:

```json
{
  "success": true,
  "service": "simple-whatsapp-chatbot",
  "database": "connected",
  "whatsapp": "connected"
}
```

### `GET /api/whatsapp/status`

Response:

```json
{
  "success": true,
  "status": "connected"
}
```

### `POST /api/messages/send`

Headers:

```http
X-API-Key: development-secret-key
Content-Type: application/json
```

Body:

```json
{
  "phone": "6281234567890",
  "message": "Halo dari API"
}
```

## Logging

Log minimal yang tersedia:

- Server berjalan
- Database connected
- Migration selesai
- QR code tersedia
- WhatsApp connecting
- WhatsApp connected
- WhatsApp disconnected
- Pesan masuk
- Pesan keluar
- Error database
- Error WhatsApp

Credential sensitif tidak dicetak ke log.

## Catatan Keamanan Dasar

- Credential dibaca dari environment variable.
- Endpoint kirim pesan dilindungi API key.
- SQL menggunakan parameterized query.
- Request body divalidasi.
- File `.env` tidak ikut ke image Docker dan tidak masuk git.
- Session WhatsApp tidak dicetak ke log.
- Raw pairing QR tidak dicetak ke terminal/log dan tidak disimpan di database.
- Password admin disimpan sebagai salted scrypt hash.
- Session token dan CSRF token hanya disimpan sebagai hash di database.

## Catatan Penggunaan Baileys

Baileys bukan WhatsApp Business Cloud API resmi. Penggunaannya harus memperhatikan ketentuan WhatsApp. Project ini tidak boleh digunakan untuk spam, scraping, bulk messaging, atau menghubungi orang tanpa izin.

## Dependency yang Digunakan

- `express`
- `pg`
- `dotenv`
- `@whiskeysockets/baileys`
- `pino`
- `@hapi/boom`
- `typescript`
- `tsx`

## Pengembangan Tahap Berikutnya

- Menambahkan validasi schema dengan library seperti Zod.
- Menambahkan guarded reset/re-pair untuk Admin dengan step-up authentication.
