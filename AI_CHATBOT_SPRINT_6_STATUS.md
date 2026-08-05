# AI Chatbot Sprint 6 — Admin Operations Beta

Status engineering: **selesai dan terverifikasi lokal**. Status customer
release: **hard-off**; Sprint 6 hanya membuka operasi dan evaluasi internal.

## Deliverable

- Playground menerima recent context terbatas dan pemilihan prompt version.
- Test case menyimpan expected category, source IDs, must/must-not contain, dan
  expected handoff.
- Run tunggal dan batch memakai pipeline Safe RAG yang sama, menyimpan trace,
  pass/fail, score, individual checks, serta dua hasil terakhir untuk compare.
- Conversation Logs menyediakan filter, timeline question/answer, source/score,
  prompt/model, token, latency, validator, safety, handoff, dan trace.
- Reviewer dapat menyimpan feedback correct, incorrect, incomplete, unsafe,
  wrong source, too long, atau too promotional.
- Export CSV dibatasi dan memakai identifier customer yang sudah dimasking.
- Response `unsupported` otomatis masuk agregasi exact-normalized Unanswered
  Questions dan ditautkan kembali ke trace/conversation.
- Admin dapat review, ignore, resolve, atau membuat draft FAQ dari unanswered.
  Draft tidak otomatis direview, dipublish, atau di-index.

## Live acceptance

| Skenario | Hasil |
|---|---|
| Unsupported response | Masuk satu aggregate dan terhubung ke conversation |
| Conversation inspector | Question, answer, source, score, model, token, latency, trace tersedia |
| Admin feedback | Tersimpan per trace dan diaudit |
| Create FAQ | Menghasilkan knowledge status `draft` |
| Test case | Deterministic assertions menghasilkan pass/fail dan score |
| Batch | Menghasilkan total, passed, failed, dan pass rate |
| Before/after | Dua run terakhir tersedia untuk dibandingkan |
| Tenant boundary | Prompt/source/trace/category divalidasi pada tenant server-derived |

## API token

API key provider asli masih tidak dibutuhkan untuk acceptance Sprint 6 karena
provider `mock` mendukung evaluation deterministik. Raw key tetap hanya boleh
berada pada backend environment, tidak melalui UI atau database.

## Verifikasi akhir

- Backend `npm run check`: 26 test files, 267 tests, typecheck dan build lulus.
- Frontend `npm run check`: lint, typecheck, 13 test files/78 tests, dan build lulus.
- Live Safe RAG smoke: log/source trace, feedback, unanswered aggregation,
  draft FAQ, isolated test-case scoring, batch pass rate, dan compare dua run lulus.
- OpenAPI AI dan Admin Control Panel valid; warning dokumentasi non-blocking tetap dicatat.
- Production build memberi warning ukuran bundle 518.12 kB; bukan blocker Sprint 6,
  tetapi code-splitting menjadi pekerjaan optimasi berikutnya.

## Gate yang masih terbuka

- Dataset dan target evaluation formal belum disetujui Product/Knowledge/Medical.
- Retention log/unanswered/feedback, izin export, dan Admin training belum sign-off.
- Provider/model/region serta kebijakan privasi belum diputuskan.
- Direct WhatsApp customer adapter tetap tidak memanggil AI.
