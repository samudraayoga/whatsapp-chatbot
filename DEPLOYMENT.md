# Production deployment

Production dijalankan sebagai tiga container:

- `control-panel`: React static build + Nginx reverse proxy;
- `app`: Admin API, WhatsApp session, chatbot, dan outbox worker;
- `db`: PostgreSQL internal tanpa published host port.

Browser hanya mengakses `control-panel`. Seluruh `/api/` diteruskan secara
same-origin ke backend sehingga cookie, CSRF, dan SSE bekerja tanpa CORS.

## Persiapan

1. Salin template environment:

   ```bash
   cp .env.production.example .env.production
   ```

2. Ganti seluruh nilai `CHANGE_ME_` dengan secret acak yang kuat.
3. Secara default control panel hanya bind ke `127.0.0.1`. Jangan mengubahnya
   ke interface publik tanpa firewall dan TLS.
4. Pasang TLS reverse proxy di depan port control panel. Login produksi memakai
   cookie `Secure`, jadi akses HTTP biasa memang tidak didukung.
5. Backup volume `postgres_data` dan `whatsapp_auth` dengan kebijakan terpisah.

`TRUST_PROXY_HOPS=2` sesuai untuk alur browser → TLS proxy → control-panel
Nginx → backend. Jika topologi proxy berbeda, set jumlah proxy tepercaya secara
eksplisit dan pastikan proxy terdepan mengganti (bukan meneruskan mentah)
header `X-Forwarded-For`.

Jangan menyimpan `.env.production`, isi volume auth, QR, atau backup credential
ke Git maupun artifact CI.

## Validasi konfigurasi

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  config
```

## Build dan start

Cara yang direkomendasikan:

```bash
./scripts/deploy-production.sh
```

Script tersebut menolak placeholder, memvalidasi Compose dan guard environment
di image final, membangun image, menyalakan stack, lalu menampilkan status.

Perintah manual ekuivalen:

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  up -d --build
```

Control panel tersedia melalui domain HTTPS yang diarahkan ke
`127.0.0.1:CONTROL_PANEL_PORT`. Contoh Caddy:

```caddyfile
panel.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

Buka menu Session dan scan QR jika volume auth belum mempunyai session. Endpoint
readiness mensyaratkan proses dan database sehat, tetapi tidak mensyaratkan
WhatsApp sudah terhubung, sehingga UI tetap dapat dibuka untuk pairing pertama.

## Pemeriksaan

```bash
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/api/admin/v1/me
docker compose --env-file .env.production -f compose.production.yaml ps
```

Request `/me` tanpa session harus menghasilkan HTTP `401`; itu menandakan proxy
dan Admin API dapat dijangkau.

## Pairing WhatsApp

Fresh pairing bergantung pada layanan WhatsApp/Baileys, bukan hanya health
container. Bila Session UI menunjukkan fatal disconnect 405, lihat catatan pada
[`RELEASE_READINESS.md`](./RELEASE_READINESS.md). Aplikasi sengaja tidak
melakukan auto-reconnect tanpa batas untuk kode terminal tersebut.

## Update

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  up -d --build
```

Migration berjalan otomatis sebelum backend menerima traffic. Jangan menghapus
volume ketika melakukan update.

## Stop

```bash
docker compose \
  --env-file .env.production \
  -f compose.production.yaml \
  down
```

Hindari `down -v` karena opsi tersebut menghapus database dan credential session.
