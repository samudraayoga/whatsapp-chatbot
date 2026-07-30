# Sprint 5 Status — Chatbot Rule Management

Status: **completed**

Output: Admin dapat mengubah response chatbot secara aman melalui control panel
tanpa mengedit source code.

## Delivered

- PostgreSQL-backed `chatbot_rule_versions` dan `chatbot_rules`.
- Seed version 1 dari rule hardcoded; menu 3 selaras dengan lokasi dan menu 4
  selaras dengan reservasi.
- Active runtime hanya membaca version `published`, dengan warm cache dan
  last-known-good cache saat database sementara gagal.
- Rule validation untuk normalized trigger, duplicate trigger/priority, empty,
  fallback, response length, action, dan batas jumlah rule.
- Draft copy, optimistic revision, immutable published rules, atomic publish,
  active-version conflict detection, rollback exact, dan cache invalidation.
- Incoming/outgoing chatbot message menyimpan active version/rule ID pada
  metadata; action `create_handoff` mengikuti rule, bukan hardcoded input.
- Admin API terautentikasi + CSRF + `chatbot.manage`:
  - `GET /api/admin/v1/chatbot/versions`
  - `POST /api/admin/v1/chatbot/versions/drafts`
  - `GET /api/admin/v1/chatbot/versions/:versionId`
  - `PUT /api/admin/v1/chatbot/versions/:versionId/rules`
  - `POST /api/admin/v1/chatbot/test`
  - `POST /api/admin/v1/chatbot/versions/:versionId/publish`
  - `POST /api/admin/v1/chatbot/versions/:versionId/rollback`
- Audit event untuk create/edit/publish/rollback; publish dan rollback
  membutuhkan summary/reason dan exact phrase confirmation.
- React page `/chatbot/rules`: version history, editor, local validation,
  dry-run console, diff summary, publish, dan rollback.
- Production API contract `0.6.0`, frontend Zod contracts, dan mock workflow.

## Verification

- Backend `npm run check`: **11 files / 82 tests passed**, typecheck dan build
  passed.
- Frontend `npm run check`: **10 files / 24 tests passed**, lint, typecheck,
  test, dan production build passed.
- PostgreSQL migration applied successfully against local Postgres 16.
- Database smoke:
  - draft isolation: passed;
  - concurrent/stale active publish conflict: passed;
  - publish activation: passed;
  - rollback restores exact response: passed;
  - temporary smoke version removed.

## Security boundary

- Viewer dan Operator tidak memiliki mutation permission.
- Published/archived rules tidak dapat diedit.
- Preview tidak mengirim pesan ke WhatsApp.
- Raw rule response tidak disalin ke audit state; audit menyimpan version,
  revision, count, dan content hash.
- Publish/rollback dilakukan dalam transaction dan tidak dapat menghasilkan dua
  active versions.
