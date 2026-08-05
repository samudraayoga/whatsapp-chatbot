# Sprint 1 Status

## Goal

Pengguna terautentikasi dapat membuka shell dan melihat health secara aman.

## Selesai

- [x] Dua akun bootstrap admin lokal untuk development.
- [x] Password salted scrypt hash.
- [x] Opaque PostgreSQL session dengan expiry dan revoke.
- [x] `HttpOnly`, `SameSite=Lax` session cookie; `Secure` pada production.
- [x] Double-submit CSRF protection untuk logout/mutation.
- [x] Server-side role/permission presets.
- [x] Audit login berhasil, login gagal, dan logout.
- [x] Login throttling: lima kegagalan per 15 menit.
- [x] Helmet security headers, JSON body limit, dan request ID.
- [x] `POST /api/admin/v1/auth/login`.
- [x] `GET /api/admin/v1/me`.
- [x] `POST /api/admin/v1/auth/logout`.
- [x] `GET /api/admin/v1/overview`.
- [x] `GET /health/live` dan `GET /health/ready`.
- [x] Login page, intended-route guard, session-expired redirect, shell, dan user menu.
- [x] Overview memisahkan database, WhatsApp, dan safety state.
- [x] Capability belum aktif ditampilkan sebagai unavailable/disabled, bukan angka nol.
- [x] Backend auth/security integration tests.
- [x] Frontend route guard/login/shell component tests.

## Development identity

Default hanya berlaku bila `NODE_ENV` bukan `production`:

```text
username: admin
password: admin123

username: superadmin
password: superadmin123
```

Set `ADMIN_BOOTSTRAP_PASSWORD` dan `SUPERADMIN_BOOTSTRAP_PASSWORD` ke password kuat
yang berbeda. Pada production kedua variable ini wajib. Mengubah variable tidak
merotasi password user yang sudah dibuat di database.

## Validasi

```bash
cd simple-whatsapp-chatbot
npm run check

cd ../whatsapp-control-panel
npm run check
```

## Deferred

- OIDC/SSO dan MFA production.
- Origin validation dan rate limit per-user untuk action operasional.
- Session/QR/reconnect UI masuk Sprint 2.
- Outbox dan follow-up tetap capability `disabled` sampai sprint terkait.
