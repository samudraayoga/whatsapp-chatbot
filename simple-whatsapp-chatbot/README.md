# simple-whatsapp-chatbot

Backend chatbot WhatsApp sederhana untuk MVP local development dengan Node.js 22, TypeScript, Express, Baileys, PostgreSQL, `pg`, Docker, dan Docker Compose.

## Fitur

- Menampilkan QR WhatsApp di terminal.
- Menyimpan session WhatsApp di volume Docker agar tidak perlu scan ulang setiap restart.
- Menerima pesan WhatsApp personal.
- Membalas otomatis dengan rule chatbot sederhana.
- Menyimpan pesan incoming dan outgoing ke PostgreSQL.
- Mengirim pesan WhatsApp melalui REST API yang dilindungi API key.

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
```

## Menjalankan Aplikasi

```bash
cp .env.example .env
docker compose up --build
```

Setelah itu:

1. Tunggu PostgreSQL menjadi healthy.
2. Tunggu QR code WhatsApp muncul di terminal atau log container `app`.
3. Buka WhatsApp di HP.
4. Masuk ke menu **Perangkat Tertaut**.
5. Scan QR code.
6. Tunggu log `WhatsApp connected`.

## Menguji Health Check

```bash
curl http://localhost:3000/health
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

## Catatan Penggunaan Baileys

Baileys bukan WhatsApp Business Cloud API resmi. Penggunaannya harus memperhatikan ketentuan WhatsApp. Project ini tidak boleh digunakan untuk spam, scraping, bulk messaging, atau menghubungi orang tanpa izin.

## Dependency yang Digunakan

- `express`
- `pg`
- `dotenv`
- `@whiskeysockets/baileys`
- `qrcode-terminal`
- `pino`
- `@hapi/boom`
- `typescript`
- `tsx`

## Pengembangan Tahap Berikutnya

- Menambahkan endpoint untuk melihat riwayat pesan.
- Menambahkan validasi schema dengan library seperti Zod.
- Menambahkan test otomatis.
- Menambahkan command atau webhook internal untuk logout session.
