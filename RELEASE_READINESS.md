# Release readiness

Status: **siap dideploy dengan satu batasan upstream yang diketahui**.

## Yang sudah diverifikasi

- Backend: typecheck, test typecheck, build, dan 105 test lulus.
- Control panel: lint, typecheck, build, dan 28 test lulus.
- `baileys-antiban`: typecheck dan seluruh manual contract test lulus.
- Audit dependency production: 0 vulnerability pada ketiga package.
- Kedua image Docker berhasil dibangun.
- Smoke stack PostgreSQL + backend + Nginx/React berhasil sehat.
- Migration dan bootstrap admin berhasil pada database kosong.
- `/healthz`, SPA root, SPA deep-link, reverse proxy API, login, cookie
  `Secure`, session auth, dan cross-origin rejection sudah diverifikasi.
- Backend image berjalan sebagai user `node`; database tidak dipublish ke host;
  control panel bind ke loopback secara default.

## Batasan upstream WhatsApp

Pada smoke test tanggal 30 Juli 2026, fresh pairing dihentikan WhatsApp dengan
status 405 sebelum QR tersedia. Laporan aktif Baileys
[#2370](https://github.com/WhiskeySockets/Baileys/issues/2370) menyebut gejala
yang sama pada fresh pairing lintas versi dan jaringan.

Kode aplikasi sekarang memperlakukan 405 sebagai terminal: tidak terjadi loop
reconnect agresif, status dan alasannya terlihat di Session UI, dan operator
dapat mencoba reconnect secara manual setelah kondisi upstream pulih. Existing
session yang valid tetap dapat dipakai melalui volume `whatsapp_auth`.

## Gate sebelum traffic produksi

1. Isi `.env.production` dengan secret unik; jangan gunakan template apa adanya.
2. Siapkan domain dan TLS reverse proxy. HTTP biasa tidak mendukung login
   production karena cookie sengaja diberi atribut `Secure`.
3. Jalankan `./scripts/deploy-production.sh`.
4. Login, buka Session, lalu verifikasi existing session atau fresh pairing.
5. Jangan aktifkan `SAFETY_RESET_ENABLED` kecuali recovery memang diperlukan.
6. Siapkan backup terenkripsi untuk volume database dan credential WhatsApp.

Fresh pairing tetap merupakan gate eksternal: bila WhatsApp masih memberi 405,
infrastruktur dashboard tetap sehat tetapi bot belum dapat menerima/mengirim
pesan sampai upstream menerima pairing.
