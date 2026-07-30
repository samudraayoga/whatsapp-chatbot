# Sprint 0 Status

## Goal

Menghilangkan ambiguity teknis utama dan membuat foundation yang memungkinkan frontend dan backend berkembang berdasarkan kontrak yang sama.

## Selesai

- [x] Membuat sibling package `whatsapp-control-panel`.
- [x] React + TypeScript + Vite foundation.
- [x] ESLint, type-check, unit/component test, production build.
- [x] Design tokens dan responsive app shell.
- [x] Runtime-validated overview contract.
- [x] Mock API untuk healthy, QR required, high risk, dan database down.
- [x] Backend Vitest harness.
- [x] Characterization test untuk:
  - normalisasi/validasi nomor;
  - rule chatbot;
  - deduplication;
  - reconnect policy;
  - health/status routes;
  - API key;
  - send payload validation;
  - disconnected send;
  - send + database persistence;
  - 404 response.
- [x] Dependency injection kecil untuk database health dan message query executor.
- [x] Draft OpenAPI `/api/admin/v1`.
- [x] RBAC, auth boundary, realtime, capability, dan dangerous-action decisions.
- [x] Draft data model outbox, idempotency, message events, session, identity, handoff, dan audit.
- [x] Threat model minimum.
- [x] CI untuk frontend, backend, dan official anti-ban check.

## Keputusan default agar development dapat berjalan

- Single-session MVP, domain model tetap memiliki `session_id`.
- React dan backend tetap sibling package.
- Production same-origin melalui reverse proxy.
- OIDC/SSO preferred; local identity hanya bootstrap/development.
- PostgreSQL durable outbox menjadi source of truth.
- SSE untuk update realtime.
- Anti-ban custom config tetap read-only sampai guardrail lengkap.

## Menunggu keputusan Product/Operations

- [ ] Copy yang benar untuk menu nomor `3` dan `4`.
- [ ] Identity provider production.
- [ ] Permission melihat full phone dan message content.
- [ ] Retention period message/event/audit.
- [ ] Delivery/read menjadi scope MVP atau Beta.
- [ ] SLA dan assignment follow-up menu `5`.

Sprint 1 dapat dimulai untuk shell/auth/read API setelah keputusan identity provider dikunci. Rule editor tidak boleh dipublikasikan sebelum copy menu 3/4 diputuskan.
