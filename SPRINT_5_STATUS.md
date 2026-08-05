# Sprint 5 Status — Chatbot Rule Management

Status: **completed**

Output: Admin dapat mengubah response chatbot secara aman melalui control panel
tanpa mengedit source code.

## Delivered

- PostgreSQL-backed active configuration dan `chatbot_rules`. Tabel version
  lama tetap dipakai sebagai compatibility storage, tetapi lifecycle-nya tidak
  lagi diekspos oleh aplikasi.
- Seed konfigurasi awal dari rule hardcoded; menu 3 selaras dengan lokasi dan
  menu 4 selaras dengan reservasi.
- Runtime hanya membaca satu konfigurasi aktif, dengan warm cache dan
  last-known-good cache saat database sementara gagal.
- Rule validation untuk normalized trigger, duplicate trigger/priority, empty,
  fallback, response length, action, dan batas jumlah rule.
- Full-set save atomik, optimistic revision conflict, hash, dan cache
  invalidation. Tidak ada draft, publish, history, atau rollback.
- Incoming/outgoing chatbot message menyimpan revision/rule ID pada metadata;
  action `create_handoff` mengikuti rule, bukan hardcoded input.
- Respons kontak pertama berasal dari rule pesan awal (`empty`) yang aktif,
  bukan string hardcoded atau alias khusus.
- Admin API terautentikasi + CSRF + `chatbot.manage`:
  - `GET /api/admin/v1/chatbot/config`
  - `PUT /api/admin/v1/chatbot/config`
  - `POST /api/admin/v1/chatbot/test`
- Audit intent durable dan outcome untuk setiap update konfigurasi.
- React page `/chatbot/rules`: satu editor langsung dengan local validation,
  preview perubahan yang belum disimpan, batalkan perubahan, dan tombol
  `Simpan & aktifkan`.
- Production API contract `0.9.0`, frontend Zod contracts, dan mock workflow.

## Verification

- Backend `npm run check`: typecheck, full test suite, dan build passed.
- Frontend `npm run check`: lint, typecheck, full test suite, dan production
  build passed.
- Atomic replacement, stale revision conflict, unsaved preview, removed routes,
  dan first-contact active greeting memiliki automated coverage.

## Security boundary

- Viewer dan Operator tidak memiliki mutation permission.
- Hanya konfigurasi aktif yang dapat dibaca atau diubah melalui API.
- Preview tidak mengirim pesan ke WhatsApp.
- Raw rule response tidak disalin ke audit state; audit menyimpan revision,
  count, dan content hash.
- Seluruh rule diganti dalam satu transaction; stale revision ditolak sebelum
  rule aktif dihapus.
