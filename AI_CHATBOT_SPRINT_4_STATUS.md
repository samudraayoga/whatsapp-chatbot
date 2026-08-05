# AI Chatbot Sprint 4 — Chatbot AI Alpha

Status engineering: **selesai dan terverifikasi lokal**. Status release customer:
**blocked/default-off** sampai safety, evaluation, dan approval berikutnya.

## Hasil utama

- Alpha RAG Console tersedia di **Integrasi Chatbot AI → Testing Playground**.
- Query dinormalisasi, di-embedding, dicari Top-K pada pgvector, difilter tenant,
  active/current-published/validity/document-ready, dideduplikasi, lalu dibatasi
  final-context count dan token budget.
- Retrieval tanpa kandidat di atas threshold tidak memanggil chat model dan
  langsung menggunakan fallback dari prompt published.
- Prompt menjaga system instruction sebagai prioritas tertinggi dan memperlakukan
  knowledge/customer input sebagai untrusted data.
- Output provider wajib berupa structured JSON. Status, panjang jawaban, dan
  `used_knowledge_ids` divalidasi terhadap context; malformed/provider error
  tidak diteruskan dan menjadi fallback.
- Conversation, incoming/outgoing message, ranked source, model, prompt version,
  token, retrieval/provider/total latency, validation state, dan trace ID
  dipersistenkan. Provider message ID idempotent dan retry mengembalikan trace
  yang sama.
- Adapter `openai-compatible` untuk chat dan embedding tersedia, di samping mock
  deterministic.

## Tempat API token

Token asli disimpan hanya di file local `.env` atau deployment secret:

```dotenv
AI_CHATBOT_PROVIDER=openai-compatible
AI_CHATBOT_CHAT_MODEL=MODEL_CHAT_YANG_DIPILIH
AI_CHATBOT_EMBEDDING_MODEL=MODEL_EMBEDDING_YANG_DIPILIH
AI_CHATBOT_PROVIDER_BASE_URL=https://api.openai.com/v1
AI_CHATBOT_PROVIDER_SECRET_REF=env://AI_PROVIDER_API_KEY
AI_PROVIDER_API_KEY=TOKEN_ASLI_DI_SINI
```

Nilai `AI_CHATBOT_PROVIDER_SECRET_REF` boleh diatur dari Settings UI, tetapi
nilai `AI_PROVIDER_API_KEY` tidak pernah dimasukkan atau dikirim melalui UI.
Jangan commit file `.env`.

Perhatian: mengganti embedding model/dimension memerlukan re-index seluruh
knowledge. Gunakan model yang disetujui sebelum mengindeks data penting.

## Guardrail rollout

- `AI_CHATBOT_ENABLED=false` tetap wajib dan direct WhatsApp customer belum
  memanggil Alpha RAG.
- Admin Playground boleh menguji provider tanpa mengirim pesan ke customer.
- Endpoint service-to-service membutuhkan `X-API-Key`, `Idempotency-Key`,
  integration active, dan `AI_CHATBOT_ALPHA_RUNTIME_ENABLED=true`.
- Alpha flag ditolak bila `NODE_ENV=production`.
- Full medical safety/output validator, handoff, bounded memory, dan customer
  cutover adalah Sprint 5+.

## Bukti acceptance

| Kriteria | Hasil |
|---|---|
| Grounded answer berdasarkan published knowledge | Lulus live smoke |
| Source/score terlihat dan dipersistenkan | Lulus |
| Draft/expired/archived/cross-tenant filter | Ditegakkan di SQL; lifecycle tests tetap hijau |
| No context tidak memanggil chat model | Lulus live smoke |
| Malformed/provider error menjadi fallback | Lulus adapter/runtime validation tests |
| Duplicate message tidak membuat response baru | Lulus; replay memakai trace yang sama |
| Model/prompt/token/latency/trace tercatat | Lulus live smoke |
| Dataset 50–100 + target Recall@K/MRR | Blocked data dan target approval Product/Knowledge/Medical |

## Verifikasi lokal

```bash
cd simple-whatsapp-chatbot
npm run dev:ai:infra
npm run test:smoke:ai-rag

cd ../whatsapp-control-panel
npm run check
```
