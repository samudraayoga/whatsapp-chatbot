# Sprint 7 AI Operations Runbook

Scope ini tetap internal. Customer WhatsApp AI harus tetap hard-off sampai gate
Sprint 8 disetujui.

## AI provider outage

1. Konfirmasi alert `PROVIDER_ERRORS` dan trace `provider_error`.
2. Pastikan fallback aman aktif; jangan membuka free generation.
3. Nonaktifkan integration/traffic flag bila error berlanjut.
4. Verifikasi secret reference, provider status, timeout, dan region tanpa
   menyalin raw secret ke log/ticket.
5. Jalankan Playground regression sebelum mengaktifkan kembali.

## Vector DB atau retrieval degraded

1. Periksa readiness PostgreSQL/pgvector dan retrieval latency.
2. Tahan publish/re-index baru jika queue ikut terdampak.
3. Pastikan no-context menghasilkan fallback, bukan jawaban tebakan.
4. Setelah pulih, jalankan search smoke dan evaluation batch.

## Queue stuck

1. Periksa Redis, worker, processing jobs, attempt count, dan safe error code.
2. Restart worker secara rolling; jangan menghapus job aktif secara massal.
3. Reprocess hanya dokumen gagal yang sumbernya masih valid.
4. Konfirmasi jumlah chunk aktif dan queue kembali di bawah threshold.

## High fallback atau low retrieval score

1. Buka Analytics, Top fallback, Unanswered Questions, dan source inspector.
2. Bedakan knowledge gap, threshold terlalu tinggi, dokumen gagal, atau prompt.
3. Perbaiki melalui draft → review → approve → publish; cache berubah otomatis
   karena signature knowledge/prompt berubah.
4. Jalankan test case before/after sebelum rollout.

## Cost spike

1. Bandingkan token, cache hit, model, tenant, dan conversation pada periode alert.
2. Turunkan traffic flag atau nonaktifkan integration jika spike tidak wajar.
3. Jangan mengganti model tanpa evaluation dan versioned change record.

## Privacy request

1. Pastikan requester dan conversation tepat.
2. Jalankan anonymization melalui Admin API berizin `ai.privacy.manage`.
3. Verifikasi content menjadi `[anonymized]`, identifier tampil `Anonymous`, dan
   audit `ai.conversation_anonymized` tersimpan.
4. Retention batch maksimum 100 conversation per run dan dapat diulang.

## Backup, restore, rollback

- Ambil PostgreSQL backup konsisten sebelum migration/release.
- Restore ke database terpisah dan verifikasi tabel tenant, knowledge, trace,
  feedback, cache, serta settings sebelum backup dianggap valid.
- Object storage harus dibackup/versioned terpisah; Redis cache dapat dibangun ulang.
- Rollback aplikasi harus kompatibel dengan migration additive Sprint 7.
- Secret rotation: buat secret baru, ubah backend reference, connection test,
  rolling deploy, lalu revoke secret lama.

## Release process

1. Full regression dan dependency/secret scan.
2. Migration backup + restore drill.
3. Deploy immutable tag ke staging production-like secara rolling.
4. Smoke health, auth, tenant boundary, Playground, Analytics, alert, queue.
5. Catat owner rollback, on-call, alert recipient, dan keputusan go/no-go.

