# AI Chatbot Sprint 5 — Safe Chatbot Beta

Status engineering: **selesai dan terverifikasi lokal**. Status release customer:
**hard-off** sampai evaluasi formal dan approval RAHO selesai.

## Deliverable

- Safety pre-check menentukan emergency, medical-personal, diagnosis, dosis,
  penghentian treatment, prompt injection, explicit admin, atau normal FAQ.
- Emergency/medical/injection/admin tidak memanggil retrieval/chat provider.
- Output provider diperiksa ulang oleh backend untuk knowledge ID, harga/lokasi
  baru, diagnosis, klaim hasil absolut, penghentian obat, prompt leakage,
  panjang, dan disclaimer.
- Disclaimer berasal dari prompt published/metadata knowledge dan tidak digandakan.
- Memory dibatasi policy 6–10 pesan (default 8), hanya dari conversation dan
  channel session yang sama. Summary, topic, dan knowledge terakhir disimpan.
- Interest detector dan admin request menghasilkan keputusan handoff.
- Handoff dibuat atomik/idempotent pada `handoff_tasks` existing dengan reason,
  priority, summary, safety, knowledge IDs, dan trace.
- Menu **Integrasi Chatbot AI → Handoff Queue** menyediakan detail, assign,
  in-progress, resolve, close, dan link ke conversation existing.
- Safe RAG Console menampilkan safety category/flags, fallback reason, memory,
  interest, disclaimer, validator, dan handoff decision.

## API token

API token masih belum wajib untuk development Sprint 5. Provider `mock`
digunakan untuk test. Saat menguji provider asli, raw token tetap hanya di:

```dotenv
AI_CHATBOT_PROVIDER_SECRET_REF=env://AI_PROVIDER_API_KEY
AI_PROVIDER_API_KEY=TOKEN_ASLI_DI_SINI
```

Jangan masukkan raw token melalui UI atau commit `.env`.

## Live acceptance

| Skenario | Hasil |
|---|---|
| Grounded answer + disclaimer metadata | Lulus |
| Follow-up memakai bounded memory | Lulus |
| Session berbeda tidak berbagi memory | Lulus |
| Emergency | Provider dilewati; safe response; high-priority handoff |
| Medical dosage/diagnosis | Provider dilewati; disclaimer; handoff |
| Prompt injection | Provider dilewati; prompt tidak dibocorkan |
| Explicit admin | `admin_required`; handoff dibuat |
| Customer interested | Handoff dibuat |
| Duplicate emergency message | Trace dan handoff yang sama dikembalikan |

## Verifikasi akhir

- Backend `npm run check`: **26 test files / 264 tests**, typecheck dan build lulus.
- Frontend `npm run check`: **13 test files / 76 tests**, lint, typecheck, test,
  dan production build lulus.
- Redocly: spesifikasi AI dan Control Panel valid; warning dokumentasi lama
  bersifat non-blocking.
- Docker Compose AI overlay dan `git diff --check`: lulus.
- Live PostgreSQL/pgvector smoke: seluruh skenario safety, memory, disclaimer,
  isolation, interest, dan idempotent handoff lulus.

## Release gate yang masih terbuka

- Rule/copy medis dan emergency belum merupakan persetujuan klinis.
- Dataset retrieval dan safety formal beserta target belum disetujui.
- Operating hours, SLA, notifikasi, retention, provider/model/region, serta
  Product/Medical/Security approval belum diputuskan.
- Direct WhatsApp customer masih tidak memanggil AI.

Laporan evaluasi engineering ada di
`simple-whatsapp-chatbot/docs/ai-chatbot/safety-evaluation-sprint-5.md`.
