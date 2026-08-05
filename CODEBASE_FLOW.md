# Dokumentasi Alur Kerja Codebase WhatsApp Chatbot

## Ringkasan

Workspace ini berisi tiga proyek yang saling terhubung:

1. `simple-whatsapp-chatbot`
   - Backend chatbot WhatsApp.
   - Menggunakan Express, PostgreSQL, Baileys, dan TypeScript.
   - Menangani pesan masuk, balasan otomatis, REST API, dan penyimpanan pesan.

2. `baileys-antiban`
   - Library middleware untuk Baileys.
   - Melindungi pengiriman pesan menggunakan rate limit, warm-up, health monitoring, timelock guard, dan mekanisme anti-ban lainnya.

3. `whatsapp-control-panel`
   - React control panel untuk admin/operator.
   - Menggunakan same-origin Admin API melalui reverse proxy Nginx di production.
   - Menangani session pairing, health, contacts, message timeline, durable
     outbox, chatbot rules, handoff, dan Safety Center tanpa terminal.

Dependency antara keduanya didefinisikan secara lokal:

```json
"baileys-antiban": "file:../baileys-antiban"
```

Struktur arsitektur utamanya:

```text
Pengguna WhatsApp
        │
        ▼
Baileys WhatsApp Socket
        │
        ▼
baileys-antiban wrapper
        │
        ▼
WhatsAppService
   ├── ChatbotService
   ├── MessageService ──► PostgreSQL
   └── REST API ────────► Express

Admin/Operator
        │ HTTPS
        ▼
React + Nginx ── /api/* ──► Admin API
                                ├── Auth/RBAC/CSRF/Audit
                                ├── Outbox worker
                                ├── Chatbot active config
                                └── PostgreSQL
```

Dokumen deployment yang menjadi rujukan operasional saat ini adalah
`DEPLOYMENT.md`; hasil gate rilis terakhir ada di `RELEASE_READINESS.md`.

---

## 1. Startup Aplikasi

Entry point aplikasi berada di:

```text
simple-whatsapp-chatbot/src/server.ts
```

Saat aplikasi dijalankan, prosesnya adalah:

1. Membaca environment variable dari `.env`.
2. Memastikan konfigurasi wajib tersedia.
3. Membuat koneksi PostgreSQL.
4. Menjalankan migration database.
5. Memanaskan cache chatbot rules dan merestore manual safety state.
6. Memastikan kedua akun bootstrap admin tersedia dan membersihkan session kedaluwarsa.
7. Membuat koneksi WhatsApp lalu membungkus socket dengan `baileys-antiban`.
8. Menyalakan durable outbox worker.
9. Membuat Express application dan membuka HTTP server.
10. Memasang graceful shutdown untuk `SIGINT` dan `SIGTERM`.

Alur sederhananya:

```text
startServer()
  │
  ├── connectDatabase()
  ├── runMigrations()
  ├── chatbotService.warmCache()
  ├── safetyCenterService.restoreManualState()
  ├── adminAuthService.ensureBootstrapAdmin()
  ├── whatsappService.connect()
  ├── outboxWorker.start()
  ├── createApp()
  └── app.listen(PORT)
```

### Catatan

`whatsappService.connect()` hanya membuat socket dan memulai koneksi. Fungsi ini tidak menunggu koneksi WhatsApp benar-benar berstatus `open`.

Akibatnya, HTTP server dapat sudah berjalan ketika WhatsApp masih:

- `connecting`;
- menunggu scan QR;
- atau belum berhasil terhubung.

Status aktual dapat dilihat melalui:

```http
GET /health
GET /api/whatsapp/status
```

---

## 2. Environment Configuration

Konfigurasi dibaca oleh:

```text
simple-whatsapp-chatbot/src/config/env.ts
```

Environment variable yang digunakan:

```env
NODE_ENV=
PORT=

POSTGRES_HOST=
POSTGRES_PORT=
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=

API_KEY=
WA_AUTH_PATH=

ADMIN_BOOTSTRAP_USERNAME=
ADMIN_BOOTSTRAP_PASSWORD=
ADMIN_BOOTSTRAP_DISPLAY_NAME=
SUPERADMIN_BOOTSTRAP_USERNAME=
SUPERADMIN_BOOTSTRAP_PASSWORD=
SUPERADMIN_BOOTSTRAP_DISPLAY_NAME=
ADMIN_SESSION_TTL_HOURS=

SAFETY_RESET_ENABLED=
TRUST_PROXY_HOPS=
ADMIN_ALLOWED_ORIGINS=
```

Aplikasi langsung melempar error saat startup apabila salah satu konfigurasi wajib tidak tersedia.
Pada `NODE_ENV=production`, secret placeholder atau password/API key yang terlalu
pendek juga ditolak sebelum server dibuka.

---

## 3. Database

Koneksi PostgreSQL dikelola melalui:

```text
simple-whatsapp-chatbot/src/database/connection.ts
```

Migration berada di:

```text
simple-whatsapp-chatbot/src/database/migrate.ts
```

Migration dijalankan dalam transaksi:

```text
BEGIN
  ├── CREATE TABLE contacts
  ├── CREATE TABLE messages
  └── CREATE INDEX idx_messages_contact_id
COMMIT
```

Jika migration gagal:

```text
ROLLBACK
```

### Tabel `contacts`

Menyimpan identitas contact WhatsApp:

| Kolom | Fungsi |
|---|---|
| `id` | Primary key |
| `whatsapp_jid` | Identitas JID WhatsApp yang unik |
| `phone_number` | Nomor yang diambil dari JID |
| `display_name` | Nama tampilan WhatsApp |
| `created_at` | Waktu contact dibuat |
| `updated_at` | Waktu contact diperbarui |

### Tabel `messages`

Menyimpan pesan masuk dan keluar:

| Kolom | Fungsi |
|---|---|
| `id` | Primary key |
| `whatsapp_message_id` | ID pesan WhatsApp yang unik |
| `contact_id` | Relasi ke tabel `contacts` |
| `direction` | `incoming` atau `outgoing` |
| `message_type` | Tipe pesan, default `text` |
| `content` | Isi pesan |
| `status` | Status pesan |
| `created_at` | Waktu penyimpanan |

`MessageService.saveMessage()` selalu melakukan:

```text
upsert contact
  │
  ▼
insert message
```

Pesan menggunakan:

```sql
ON CONFLICT (whatsapp_message_id) DO NOTHING
```

Hal ini mencegah event WhatsApp dengan ID sama diproses lebih dari sekali.

---

## 4. Pembuatan Koneksi WhatsApp

Implementasi koneksi berada di:

```text
simple-whatsapp-chatbot/src/services/whatsapp.service.ts
```

Urutannya:

```text
connect()
  │
  ├── buat direktori auth
  └── startSocket()
        │
        ├── baca multi-file auth state
        ├── buat raw Baileys socket
        ├── bungkus dengan wrapSocket()
        ├── pasang creds.update
        ├── pasang connection.update
        └── pasang messages.upsert
```

Konfigurasi Baileys utama:

```typescript
{
  browser: Browsers.ubuntu('Simple WhatsApp Chatbot'),
  markOnlineOnConnect: false
}
```

Session WhatsApp disimpan di lokasi yang ditentukan oleh:

```env
WA_AUTH_PATH
```

Jika session belum tersedia, QR code akan dicetak ke terminal.

---

## 5. Penanganan Koneksi dan Reconnect

Event `connection.update` mengubah status internal menjadi:

```typescript
type WhatsAppStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected';
```

### Saat koneksi terbuka

```text
connection === "open"
  │
  ├── status = connected
  ├── hapus reconnect timer
  └── tulis log connected
```

### Saat koneksi ditutup

```text
connection === "close"
  │
  ├── status = disconnected
  ├── baca status code
  ├── loggedOut/badSession?
  │      └── jangan reconnect
  └── selain itu
         └── reconnect setelah 5 detik
```

Reconnect timer dibuat satu kali. Jika timer masih aktif, aplikasi tidak membuat timer tambahan.

---

## 6. Alur Pesan WhatsApp Masuk

Pesan masuk diterima dari event:

```text
messages.upsert
```

Alurnya:

```text
messages.upsert
  │
  ├── pastikan type === "notify"
  ├── proses pesan satu per satu
  ├── validasi remoteJid dan message ID
  ├── abaikan pesan dari bot sendiri
  ├── abaikan status broadcast
  ├── abaikan group
  ├── ambil text
  ├── simpan incoming ke database
  ├── hentikan jika pesan duplikat
  ├── tentukan jawaban chatbot
  ├── kirim jawaban melalui socket anti-ban
  └── simpan outgoing ke database
```

Aplikasi hanya mengambil teks dari:

```typescript
message.message?.conversation
message.message?.extendedTextMessage?.text
```

Jenis pesan berikut belum diproses:

- gambar;
- video;
- caption media;
- audio;
- document;
- reaction;
- group message;
- status broadcast.

### Deduplication

Pesan incoming disimpan terlebih dahulu sebelum chatbot membalas.

Jika `whatsapp_message_id` sudah ada:

```text
Duplicate incoming WhatsApp message ignored
```

Chatbot tidak mengirim balasan kedua untuk event tersebut.

---

## 7. Logika Chatbot

Logika chatbot berada di:

```text
simple-whatsapp-chatbot/src/services/chatbot.service.ts
```

Input dinormalisasi menggunakan:

```typescript
input?.trim().toLowerCase()
```

Aturannya:

| Input | Respons |
|---|---|
| `halo`, `hai`, `hello` | Menu utama |
| `menu` | Menu utama |
| Pesan kosong | Menu utama |
| `1` | Informasi Raho Club Premier |
| `2` | Program kesehatan |
| `3` | Informasi konsultasi |
| `4` | Informasi lokasi |
| `5` | Pemberitahuan bahwa admin akan menghubungi |
| Input lain | Pesan fallback |

### Ketidaksesuaian menu

Menu menampilkan:

```text
3. Lokasi Cabang
4. Reservasi
```

Namun implementasinya:

- jawaban nomor 3 membahas konsultasi;
- jawaban nomor 4 membahas lokasi.

README juga masih menyebut command lama seperti `ping` dan `jam`, tetapi command tersebut sudah tidak tersedia di source saat ini.

---

## 8. Alur Pengiriman Melalui REST API

Endpoint pengiriman:

```http
POST /api/messages/send
```

Header wajib:

```http
X-API-Key: <API_KEY>
Content-Type: application/json
```

Body:

```json
{
  "phone": "6281234567890",
  "message": "Halo"
}
```

Alur pemrosesan:

```text
HTTP request
  │
  ├── validasi X-API-Key
  ├── validasi phone
  ├── validasi message
  ├── maksimal 4096 karakter
  ├── normalisasi nomor telepon
  ├── validasi panjang 10–15 digit
  ├── pastikan WhatsApp connected
  ├── buat JID
  ├── kirim melalui socket anti-ban
  ├── simpan outgoing ke database
  └── HTTP 200
```

### Normalisasi nomor

Contoh:

```text
081234567890  → 6281234567890
81234567890   → 6281234567890
6281234567890 → 6281234567890
```

JID dibentuk menjadi:

```text
6281234567890@s.whatsapp.net
```

### Potensi inkonsistensi

Pengiriman dilakukan sebelum penyimpanan database:

```text
kirim ke WhatsApp
  │
  ▼
simpan ke PostgreSQL
```

Jika WhatsApp berhasil tetapi database gagal:

- pesan tetap sampai ke penerima;
- API mengembalikan error 500;
- client dapat mengira pesan gagal;
- retry dari client dapat menyebabkan pesan terkirim dua kali.

---

## 9. Endpoint HTTP

### Health check

```http
GET /health
```

Contoh respons:

```json
{
  "success": true,
  "service": "simple-whatsapp-chatbot",
  "database": "connected",
  "whatsapp": "connected"
}
```

### Status WhatsApp

```http
GET /api/whatsapp/status
```

Contoh:

```json
{
  "success": true,
  "status": "connected"
}
```

### Kirim pesan

```http
POST /api/messages/send
```

Hanya endpoint pengiriman yang dilindungi API key. Endpoint health dan status dapat diakses tanpa API key.

Route yang tidak ditemukan mengembalikan:

```json
{
  "success": false,
  "message": "Route not found"
}
```

---

## 10. Cara Kerja `baileys-antiban`

Komponen pusat library:

```text
baileys-antiban/src/wrapper.ts
baileys-antiban/src/antiban.ts
```

`wrapSocket()` mengganti implementasi `sendMessage()` dengan fungsi yang menjalankan pemeriksaan anti-ban.

```text
socket.sendMessage()
  │
  ▼
wrappedSendMessage()
  │
  ├── canonicalize JID jika aktif
  ├── circuit breaker jika aktif
  ├── AntiBan.beforeSend()
  ├── tunggu delay
  ├── kirim melalui sendMessage asli
  ├── AntiBan.afterSend()
  └── catat hasil
```

### Serialisasi pengiriman

Wrapper menggunakan promise lock:

```typescript
let sendLock: Promise<void> = Promise.resolve();
```

Semua pengiriman diproses satu per satu.

Tujuannya agar request paralel tidak:

- membaca counter rate limit yang sama;
- mengirim bersamaan;
- melewati batas sebelum `afterSend()` mencatat pengiriman sebelumnya.

Konsekuensinya, satu pengiriman yang memiliki delay panjang dapat menahan seluruh pengiriman berikutnya.

---

## 11. Urutan Pemeriksaan Anti-Ban

`AntiBan.beforeSend()` melakukan pemeriksaan berikut:

```text
1. Health monitor
2. Ban recovery phase
3. Timelock guard
4. Warm-up limit
5. Contact graph
6. Topology risk
7. Reply ratio
8. Reconnect throttle
9. Shared instance pool
10. Group profile limit
11. Rate limiter
12. Circadian multiplier
13. Cold-contact multiplier
14. Distraction pause
15. Offline gap
```

Jika salah satu pemeriksaan menolak:

```typescript
{
  allowed: false,
  delayMs: 0,
  reason: "..."
}
```

Jika diizinkan:

```typescript
{
  allowed: true,
  delayMs: 5000,
  health: { ... }
}
```

---

## 12. Konfigurasi Anti-Ban yang Aktif

Chatbot menggunakan:

```typescript
{
  preset: 'conservative',
  persist: 'auth/antiban-state.json',
  logging: true
}
```

Nilai preset `conservative`:

| Pengaturan | Nilai |
|---|---:|
| Maksimal per menit | 5 |
| Maksimal per jam | 100 |
| Maksimal per hari | 800 |
| Minimum delay | 2.500 ms |
| Maksimum delay | 7.000 ms |
| Delay tambahan chat baru | 4.000 ms |
| Maksimum pesan identik | 3 |
| Window pesan identik | 1 jam |
| Burst allowance | 3 |
| Warm-up | 10 hari |
| Limit hari pertama | 15 pesan |
| Growth factor | 1,8 |
| Inactivity threshold | 72 jam |
| Auto-pause health | `medium` |
| Group multiplier | 0,5 |

Rate limiter juga menambahkan typing delay berdasarkan panjang pesan:

```text
sekitar 30 ms per karakter
maksimal 3 detik
```

### Fitur wrapper yang aktif

- Rate limiter.
- Warm-up.
- Health monitoring.
- Timelock guard.
- Ban recovery tracking.
- Delivery tracking.
- Group operation guard.
- State persistence.
- Serial send lock.

### Fitur yang sengaja dimatikan

```typescript
{
  autoRespondToIncoming: false,
  legitimacySignals: false
}
```

`autoRespondToIncoming` dimatikan karena jawaban ditangani `ChatbotService`.

`legitimacySignals` dimatikan agar library tidak menyisipkan typo dan koreksi otomatis ke teks chatbot.

---

## 13. State Anti-Ban

State disimpan di:

```text
<WA_AUTH_PATH>/antiban-state.json
```

State utama yang disimpan:

- warm-up progress;
- known chats;
- waktu penyimpanan;
- versi state.

Penyimpanan dilakukan secara debounce setelah pesan berhasil dikirim.

Untuk disconnect serius seperti `401` atau `403`, state disimpan segera.

---

## 14. Modul-Modul `baileys-antiban`

### Modul inti

| Modul | Fungsi |
|---|---|
| `antiban.ts` | Orchestrator seluruh pemeriksaan |
| `wrapper.ts` | Membungkus socket Baileys |
| `rateLimiter.ts` | Limit per menit, jam, hari, dan pesan identik |
| `warmup.ts` | Peningkatan limit bertahap |
| `health.ts` | Menghitung risiko session |
| `timelockGuard.ts` | Memblokir contact baru ketika kena 463 |
| `banRecoveryOrchestrator.ts` | Recovery setelah restriction atau ban |
| `deliveryTracker.ts` | Mengukur delivery rate |

### Identitas dan session

| Modul | Fungsi |
|---|---|
| `lidResolver.ts` | Mapping LID dan phone-number JID |
| `lidFirstResolver.ts` | Resolver dengan pendekatan LID-first |
| `jidCanonicalizer.ts` | Menyatukan bentuk JID |
| `sessionStability.ts` | Disconnect classifier dan session health |
| `retryTracker.ts` | Mendeteksi retry spiral |
| `retryReason.ts` | Mengklasifikasikan alasan retry |
| `messageRecovery.ts` | Mengambil pesan yang hilang setelah reconnect |
| `credsSnapshot.ts` | Snapshot credential |

### Perilaku manusia

| Modul | Fungsi |
|---|---|
| `presenceChoreographer.ts` | Typing plan, circadian timing, offline gap |
| `humanEntropy.ts` | Aktivitas acak seperti manusia |
| `legitimacySignalInjector.ts` | Typo, correction, dan typing pause |
| `readReceiptVariance.ts` | Variasi waktu read receipt |
| `stealthConnect.ts` | Browser profile dan presence ramp |
| `deviceFingerprint.ts` | Device fingerprint |
| `sessionFingerprint.ts` | Fingerprint per session |

### Risiko sosial dan jaringan

| Modul | Fungsi |
|---|---|
| `replyRatio.ts` | Mengukur rasio pesan masuk dan keluar |
| `contactGraph.ts` | Mengelola handshake dan contact trust |
| `topologyThrottler.ts` | Mengontrol ekspansi contact graph |
| `reputationVoucher.ts` | Vouching dari account berpengalaman |
| `groupOperationGuard.ts` | Limit add/remove/create group |
| `jidCircuitBreaker.ts` | Memblokir sementara JID yang sering gagal |

### Infrastruktur

| Modul | Fungsi |
|---|---|
| `messageQueue.ts` | Queue, priority, retry, dan dead-letter |
| `instanceCoordinator.ts` | Rate pool lintas proses |
| `fleetEventStore.ts` | Sinkronisasi event antar-instance |
| `proxyRotator.ts` | Rotasi proxy |
| `stateExport.ts` | Export/import snapshot |
| `stateAdapter.ts` | Adapter penyimpanan state |
| `persist.ts` | Persistence internal |

### Utilitas

| Modul | Fungsi |
|---|---|
| `contentVariator.ts` | Membuat variasi pesan |
| `scheduler.ts` | Membatasi pengiriman berdasarkan jam |
| `webhooks.ts` | Alert webhook, Telegram, dan Discord |
| `observability.ts` | Logger dan Prometheus metrics |
| `messageTypeRegistry.ts` | Statistik berdasarkan tipe pesan |
| `patch.ts` | Patch integrasi otomatis |
| `cli.ts` | Command-line interface |

Sebagian besar modul tersebut bersifat opsional dan belum diaktifkan oleh aplikasi chatbot saat ini.

---

## 15. Graceful Shutdown

Ketika menerima `SIGINT` atau `SIGTERM`:

```text
shutdown()
  │
  ├── tandai proses sedang shutdown
  ├── tutup HTTP server
  ├── hapus reconnect timer
  ├── hapus listener socket
  ├── tutup WebSocket WhatsApp
  ├── tutup PostgreSQL pool
  └── process.exit(0)
```

Flag `isShuttingDown` mencegah shutdown dijalankan dua kali.

---

## 16. Docker

`compose.yaml` membuat dua service:

```text
app
 ├── build TypeScript application
 ├── expose port 3000
 ├── mount whatsapp_auth
 └── bergantung pada db yang healthy

db
 ├── PostgreSQL 16
 ├── expose port 5432
 ├── mount postgres_data
 └── menjalankan pg_isready healthcheck
```

Volume yang digunakan:

| Volume | Isi |
|---|---|
| `postgres_data` | Data PostgreSQL |
| `whatsapp_auth` | Session WhatsApp dan state anti-ban |

Dockerfile menggunakan multi-stage build:

```text
deps
  → install dependency

builder
  → compile TypeScript

runner
  → install production dependency
  → copy dist
  → jalankan npm start
```

---

## 17. Logging dan Error Handling

Logger aplikasi menghasilkan JSON:

```json
{
  "timestamp": "2026-01-01T00:00:00.000Z",
  "level": "INFO",
  "message": "WhatsApp connected"
}
```

Nomor telepon disamarkan sebelum masuk log:

```text
6281***890
```

Error middleware mengembalikan:

```json
{
  "success": false,
  "message": "..."
}
```

Pada mode non-production, stack trace ikut dikirim dalam response.

---

## 18. Temuan dan Risiko Teknis

### 18.1 Dokumentasi chatbot

README, konfigurasi aktif, dan rule awal memakai menu Raho Club Premier yang
sama. Perubahan konten berikutnya dilakukan melalui alur
`edit → test → simpan & aktifkan`.

### 18.2 Konsistensi menu nomor 3 dan 4

Label dan jawaban awal sudah diselaraskan serta dilindungi regression test.
Perubahan melalui editor harus tetap menjaga konsistensi tersebut.

### 18.3 JID canonicalizer belum aktif

Baileys v7 dapat menggunakan JID berbentuk `@lid`.

Saat ini `phoneFromJid()` hanya menghapus domain:

```text
12345@lid → 12345
```

Nilai tersebut dapat tersimpan sebagai nomor telepon meskipun sebenarnya merupakan ID LID.

Satu orang juga berpotensi tersimpan dua kali:

```text
12345@lid
6281234567890@s.whatsapp.net
```

Library sudah mempunyai `LidResolver` dan `JidCanonicalizer`, tetapi belum diaktifkan dalam konfigurasi chatbot.

### 18.4 Pengiriman dan database tidak atomik

Jika WhatsApp berhasil tetapi database gagal, API akan melaporkan kegagalan meskipun pesan sudah terkirim.

Solusi jangka panjang dapat menggunakan:

- outbox pattern;
- message queue;
- idempotency key;
- status `pending`, `sent`, dan `failed`;
- reconciliation berdasarkan WhatsApp message ID.

### 18.5 Belum ada test aplikasi

`simple-whatsapp-chatbot` belum memiliki automated test.

Bagian yang sebaiknya diuji:

- normalisasi nomor;
- validasi request;
- rule chatbot;
- deduplication;
- reconnect;
- database failure setelah pesan terkirim;
- incoming message filtering.

### 18.6 Test runner library tidak konsisten

Perintah resmi berikut berhasil:

```bash
npm run test:check
```

Namun perintah tersebut hanya menjalankan:

```text
tests/manual-test.ts
```

Saat seluruh folder test dijalankan dengan Vitest:

- banyak file mengandalkan global Jest;
- Vitest globals tidak dikonfigurasi;
- beberapa file merupakan script manual tanpa test suite;
- terdapat tiga assertion gagal;
- terdapat satu unhandled rejection.

Artinya, type-check dan manual test lulus, tetapi full automated test suite belum sepenuhnya sehat.

### 18.7 Pengiriman sepenuhnya serial

Promise lock mencegah race condition rate limiter, tetapi juga menyebabkan head-of-line blocking.

Jika satu pesan mendapat delay panjang, semua pesan berikutnya harus menunggu walaupun dikirim ke JID yang berbeda.

---

## 19. Hasil Verifikasi

Hasil pemeriksaan:

```text
simple-whatsapp-chatbot
  ✅ TypeScript type-check lulus

baileys-antiban
  ✅ TypeScript type-check lulus
  ✅ Manual test resmi lulus
  ⚠️ Full Vitest suite belum sehat
```

Tidak ada source yang diubah selama proses analisis awal.

Sebelum dokumentasi ini dibuat, subproject `baileys-antiban` sudah memiliki perubahan lokal pada:

```text
src/wrapper.ts
dist/wrapper.js
dist/cjs/wrapper.js
```

Perubahan tersebut bukan dibuat sebagai bagian dari analisis ini.

---

## 20. Kesimpulan

Alur utama aplikasi adalah:

```text
Startup
  → database
  → migration
  → WhatsApp socket
  → anti-ban wrapper
  → Express server

Incoming WhatsApp
  → filter
  → deduplicate
  → simpan database
  → pilih jawaban
  → anti-ban check
  → kirim jawaban
  → simpan outgoing

REST API
  → API key
  → validasi
  → normalisasi nomor
  → anti-ban check
  → kirim WhatsApp
  → simpan outgoing

Disconnect
  → klasifikasi
  → stop untuk bad session
  → reconnect setelah 5 detik untuk error lain

Shutdown
  → tutup HTTP
  → tutup WhatsApp
  → tutup database
```

Secara umum, struktur aplikasi sudah cukup jelas untuk MVP. Bagian yang paling perlu diperhatikan berikutnya adalah sinkronisasi menu, konsistensi database setelah pengiriman, dukungan JID/LID, dan perbaikan konfigurasi automated test.
