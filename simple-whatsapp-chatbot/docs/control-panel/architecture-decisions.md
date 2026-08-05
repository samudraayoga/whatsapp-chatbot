# Architecture Decisions — Sprint 0

Status keputusan:

- **Accepted:** aman dikunci sekarang.
- **Default:** dipakai agar development dapat berjalan, tetapi masih dapat diubah Product/Operations.
- **Blocked:** membutuhkan keputusan bisnis sebelum fitur terkait dipublikasikan.

## ADR-001 — Control panel sebagai sibling package

**Status:** Accepted

```text
workspace/
├── baileys-antiban/
├── simple-whatsapp-chatbot/
└── whatsapp-control-panel/
```

React tidak di-embed sebagai source backend. Development lifecycle, dependency, test, dan build dipisah. Production tetap direkomendasikan same-origin melalui reverse proxy:

```text
/      → static React app
/api/  → simple-whatsapp-chatbot
```

## ADR-002 — Backend menjadi Admin API/BFF

**Status:** Accepted

Browser tidak mengakses `baileys-antiban`, PostgreSQL, auth files, atau WhatsApp socket secara langsung. Backend menyediakan operational facade yang:

- menggabungkan health, session, anti-ban, outbox, dan follow-up;
- memetakan internal state menjadi DTO stabil;
- menerapkan authentication, authorization, CSRF, dan audit;
- menyembunyikan secret dan raw state file.

Endpoint baru memakai prefix `/api/admin/v1`.

## ADR-003 — Authentication

**Status:** Default

- Production: OIDC/SSO bila organisasi sudah memiliki identity provider.
- Development/bootstrap: local admin terbatas.
- Browser session: secure `HttpOnly`, `SameSite=Lax` atau lebih ketat, cookie rotation.
- Mutation: CSRF token/header.
- API key existing dipertahankan hanya untuk integrasi service-to-service.

Keputusan identity provider final masih perlu konfirmasi pemilik produk.

## ADR-004 — Role dan permission

**Status:** Accepted

Role hanya preset; enforcement berdasarkan permission.

| Permission | Viewer | Operator | Admin |
|---|:---:|:---:|:---:|
| `dashboard.read` | ✓ | ✓ | ✓ |
| `contacts.read` | ✓ | ✓ | ✓ |
| `messages.read` | ✓ | ✓ | ✓ |
| `messages.send` | – | ✓ | ✓ |
| `messages.cancel` | – | ✓ | ✓ |
| `handoffs.manage` | – | ✓ | ✓ |
| `session.reconnect` | – | ✓ | ✓ |
| `safety.pause` | – | ✓ | ✓ |
| `safety.resume` | – | – | ✓ |
| `session.reset` | – | – | ✓ |
| `chatbot.manage` | – | – | ✓ |
| `audit.read` | – | – | ✓ |
| `users.manage` | – | – | ✓ |

Resume lebih terbatas daripada pause karena resume dapat meningkatkan risiko account.

## ADR-005 — Durable outbox sebagai source of truth

**Status:** Accepted

Control panel tidak memakai endpoint synchronous send sebagai command utama. `POST /api/admin/v1/messages`:

1. memvalidasi permission dan payload;
2. mengklaim `Idempotency-Key`;
3. membuat logical message dan outbox item dalam satu transaksi;
4. mengembalikan `202 Accepted`;
5. worker mengirim melalui wrapped WhatsApp socket;
6. setiap state transition ditulis sebagai immutable event.

`baileys-antiban` `MessageQueue` tidak dijalankan sebagai antrean paralel. PostgreSQL outbox menjadi satu-satunya source of truth kecuali dibuat adapter eksplisit.

## ADR-006 — Realtime memakai SSE

**Status:** Accepted

Status session, readiness, risk, dan message event dominan satu arah dari server ke browser. Gunakan Server-Sent Events:

- command tetap HTTP;
- reconnect otomatis memakai event ID;
- fallback polling ketika stream stale;
- authorization memakai browser session yang sama.

WebSocket baru dipertimbangkan jika nanti ada kebutuhan komunikasi dua arah berfrekuensi tinggi.

## ADR-007 — Single-session MVP, multi-session-ready data

**Status:** Default

MVP mengoperasikan satu nomor/session karena service saat ini singleton dan hanya mempunyai satu `WA_AUTH_PATH`. Tabel domain baru tetap memiliki `session_id` agar migrasi multi-session tidak memerlukan redesign total.

Fleet/multi-session UI tidak dirilis pada MVP.

## ADR-008 — Capability state

**Status:** Accepted

Setiap modul operasional dilaporkan sebagai:

```text
enabled | disabled | not_instrumented | unavailable
```

Angka nol hanya berarti nilai aktual nol. Modul yang belum di-wire tidak boleh ditampilkan sebagai sehat.

## ADR-009 — Warm-up normalization

**Status:** Accepted

Library saat ini menghasilkan `warmUp.progress` dalam rentang `0–100`, sedangkan UI contract menggunakan:

```json
{
  "progressRatio": 0.5
}
```

Admin facade melakukan normalisasi `progress / 100` dan mengunci rentang `0–1` dengan contract test.

## ADR-010 — Dangerous operations

**Status:** Accepted

Action berikut membutuhkan audit. Alasan operator diwajibkan untuk tindakan
operasional yang memerlukan konteks manual. Credential reset/re-pair memakai
alasan server-side karena merupakan one-click action; perubahan konfigurasi
chatbot memakai revision, rule count, dan content hash sebagai konteks audit
tanpa field alasan tambahan di editor:

- resume pada risk tinggi/critical;
- reset atau re-pair session;
- retry message sebagai logical message baru;
- perubahan konfigurasi chatbot aktif;
- perubahan role/permission.

Action reset tidak boleh diberi label “Reset all” karena `AntiBan.reset()` saat ini tidak mereset seluruh rate limiter, delivery tracker, dan recovery state.

## Keputusan produk yang masih blocked

1. **Menu 3 dan 4:** label menu menyebut “Lokasi Cabang” dan “Reservasi”, tetapi respons source saat ini adalah konsultasi dan lokasi.
2. **Identity provider:** OIDC/SSO atau local accounts untuk production.
3. **PII access:** role mana yang boleh melihat nomor dan isi pesan penuh.
4. **Retention:** message content, operational event, dan audit.
5. **Delivery promise:** delivered/read masuk MVP atau Beta.
6. **Follow-up SLA:** batas waktu dan assignment untuk pilihan menu `5`.

Sampai keputusan nomor 1 dibuat, test hanya mengkarakterisasi perilaku source saat ini dan tidak mengubah copy pelanggan.
