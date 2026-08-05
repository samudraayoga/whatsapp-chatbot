# Threat Model — Control Panel Foundation

## Scope

```text
Admin browser
  → reverse proxy
  → React static app
  → Admin API/BFF
      ├── PostgreSQL
      ├── WhatsAppService
      ├── baileys-antiban
      └── auth/session files
```

## Aset sensitif

- WhatsApp auth credential dan QR pairing.
- API key existing.
- Database credential.
- Full phone number/JID.
- Isi percakapan.
- Admin session dan permission.
- Webhook/alert secret.
- Anti-ban state dan operational configuration.
- Audit trail.

## Trust boundaries

1. Browser ↔ reverse proxy/API.
2. Admin API ↔ PostgreSQL.
3. Backend ↔ WhatsApp/Baileys.
4. Backend ↔ filesystem auth state.
5. Backend ↔ external alert providers.

## Ancaman dan kontrol

| Ancaman | Contoh | Kontrol minimum |
|---|---|---|
| Credential exposure | API key ditaruh pada `VITE_*` | Browser session; secret server-side; secret scanning |
| Session theft | Cookie dicuri melalui XSS | HttpOnly, Secure, SameSite, CSP, output encoding |
| CSRF | Attacker memicu resume/reset | CSRF token, SameSite, origin validation |
| Broken authorization | Viewer memanggil resume API | Permission check di service/router; negative tests |
| QR leakage | QR masuk log/screenshot monitoring | In-memory TTL, no-log, role restriction, immediate invalidation |
| PII leakage | Full phone/message masuk structured log | Masking, log schema, retention, access control |
| Duplicate send | Browser retry setelah timeout | Idempotency key, durable outbox, unknown outcome |
| Safety bypass | Reset untuk menghapus limit | Guarded safety command, reason, step-up, audit |
| Audit tampering | Admin menghapus jejak | Append-only application permission, backup/retention |
| Event spoofing | Client mengirim fake status | Status hanya berasal dari backend; SSE read-only |
| Dependency compromise | Package frontend/backend berbahaya | Lockfile, audit, review, CI |
| Denial of service | Login/send spam | Rate limit, body limit, queue capacity, backpressure |
| SQL injection | Search/filter dirangkai ke SQL | Parameterized query dan validated filter |

## Security acceptance Sprint 0

- Tidak ada secret pada frontend source atau `.env.example`.
- UI client memakai `credentials: include`, bukan API key.
- OpenAPI mendefinisikan cookie auth dan CSRF header pada mutation.
- Permission matrix dan dangerous action terdokumentasi.
- Test existing memastikan send endpoint lama tetap memakai API key.
- QR/auth file tidak diekspos oleh contract draft.

## Security controls implemented Sprint 1

- Opaque session token hanya disimpan dalam bentuk SHA-256 di PostgreSQL.
- Password admin disimpan sebagai salted scrypt hash.
- Session cookie `HttpOnly`, `SameSite=Lax`, dan `Secure` pada production.
- Double-submit CSRF token untuk mutation terautentikasi.
- Permission middleware dijalankan server-side.
- Login dibatasi lima kegagalan per 15 menit per process.
- Login/logout ditulis ke audit log.
- Helmet security headers dan batas JSON body 1 MB.
- Semua response Admin API memiliki correlation/request ID.

## Security controls implemented Sprint 2

- Raw pairing QR hanya disimpan in-memory dengan TTL 60 detik.
- QR dihapus ketika connected/expired dan tidak dicetak ke terminal atau event payload.
- Endpoint QR memakai permission `session.reconnect` dan response `no-store`.
- Reconnect dan pause memakai permission, CSRF, rate limit, dan audit.
- Reconnect terminal state (`logged_out`/`bad_session`) tidak membuat retry loop.
- Emergency pause diperiksa sebelum setiap send baru dan diterapkan kembali saat socket berganti.
- SSE hanya membawa snapshot operasional tersanitasi; polling 10 detik menjadi fallback.
- Event operasional minimum disimpan tanpa credential atau raw QR.

## Security controls implemented Sprint 6

- Operator hanya mendapat `safety.pause`; `safety.resume` dan `session.reset`
  tetap permission Admin.
- Safety resume/reset memerlukan CSRF, mutation rate limit, alasan 5–500
  karakter, exact acknowledgement/confirmation, dan verifikasi password saat
  ini.
- Credential reset/re-pair memerlukan permission `session.reset`, CSRF, mutation
  rate limit, dan audit, tetapi tidak memerlukan request body atau step-up.
- Recovery `paused`/`dead` dan timelock aktif tidak dapat dilewati oleh resume.
- Reset default-off melalui `SAFETY_RESET_ENABLED`, memerlukan eligibility, dan
  tetap meninggalkan sending dalam manual pause.
- Pause/resume/reset menyimpan actor, alasan operator atau alasan server-side,
  before/after state, request ID, IP, dan user agent pada audit.
- Safety delay menyimpan reason code dan rekomendasi tersanitasi pada message
  event; raw error/JID tidak dipantulkan ke UI.
- Manual pause dipersist di PostgreSQL dan direstore sebelum koneksi WhatsApp.

## Security backlog Sprint 7+

- Tambahkan origin validation pada seluruh mutation.
- Rate limit mutation operasional per user.
- OIDC/SSO dan MFA untuk production.
- Dependency and secret scan pada CI.
