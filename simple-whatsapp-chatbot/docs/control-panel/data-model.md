# Data Model — Control Panel

Tabel identity/session admin, audit, operational events, kolom identity contact,
index timeline, dan `handoff_tasks` sudah aktif pada Sprint 1–3. Tabel
channel/outbox dan logical-message redesign tetap rancangan sprint berikutnya.

## Prinsip migration

- Incremental dan transactional.
- Existing table `contacts` dan `messages` tetap dapat dipakai selama backfill.
- Constraint unik identity baru ditambahkan setelah conflict audit.
- Provider call tidak pernah dianggap atomic dengan database transaction.
- Semua mutasi administrative memiliki audit trail.

## Entity relationship

```text
channel_sessions 1 ─── * contacts
channel_sessions 1 ─── * logical_messages
contacts         1 ─── * logical_messages
logical_messages 1 ─── 1 outbox_messages
logical_messages 1 ─── * message_events
contacts         1 ─── * handoff_tasks
admin_users      1 ─── * audit_logs
operational_events     (append-only timeline)
```

## `channel_sessions`

| Column | Type | Catatan |
|---|---|---|
| `id` | UUID | Primary key |
| `name` | TEXT | Label non-secret |
| `state` | TEXT | Facade state, bukan raw socket |
| `last_transition_at` | TIMESTAMPTZ | State freshness |
| `connected_at` | TIMESTAMPTZ nullable | Uptime |
| `last_disconnect_code` | INTEGER nullable | Diagnostic |
| `last_disconnect_reason` | TEXT nullable | Sanitized |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Raw credential dan QR tidak disimpan pada tabel ini.

## Contact identity

Perubahan `contacts`:

- `session_id UUID`;
- `canonical_jid TEXT`;
- `pn_jid TEXT`;
- `lid_jid TEXT`;
- `identity_status TEXT`: `resolved`, `unresolved`, `conflict`;
- `last_message_at TIMESTAMPTZ`.

Tambahkan tabel `contact_identities` bila satu contact membutuhkan banyak alias:

| Column | Type |
|---|---|
| `id` | BIGSERIAL |
| `contact_id` | BIGINT |
| `session_id` | UUID |
| `jid` | TEXT |
| `jid_type` | TEXT |
| `source` | TEXT |
| `verified_at` | TIMESTAMPTZ nullable |

Backfill:

1. isi `session_id` default;
2. klasifikasikan JID existing;
3. jalankan canonicalizer/report;
4. tandai conflict;
5. review conflict;
6. baru tambahkan unique constraint `(session_id, canonical_jid)`.

Jangan melakukan auto-merge contact conflict.

## `logical_messages`

| Column | Type | Catatan |
|---|---|---|
| `id` | UUID | Logical ID |
| `session_id` | UUID | Future multi-session |
| `contact_id` | BIGINT | Recipient/sender |
| `direction` | TEXT | incoming/outgoing |
| `message_type` | TEXT | MVP `text` |
| `content` | TEXT | PII |
| `state` | TEXT | State machine |
| `provider_message_id` | TEXT nullable | WhatsApp ID |
| `client_request_id` | TEXT nullable | Correlation |
| `scheduled_at` | TIMESTAMPTZ nullable | |
| `queued_at` | TIMESTAMPTZ nullable | |
| `sending_at` | TIMESTAMPTZ nullable | |
| `sent_at` | TIMESTAMPTZ nullable | |
| `delivered_at` | TIMESTAMPTZ nullable | |
| `read_at` | TIMESTAMPTZ nullable | |
| `failed_at` | TIMESTAMPTZ nullable | |
| `error_code` | TEXT nullable | Machine-readable |
| `error_message` | TEXT nullable | Sanitized |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

State:

```text
accepted
  → queued
  → scheduled
  → safety_delayed
  → sending
      ├── sent → delivered → read
      ├── retrying → queued
      ├── failed
      └── unknown_outcome

accepted/queued/scheduled/safety_delayed → canceled
```

## `outbox_messages`

| Column | Type | Catatan |
|---|---|---|
| `id` | UUID | |
| `logical_message_id` | UUID UNIQUE | |
| `state` | TEXT | queued/leased/completed/failed/canceled |
| `priority` | TEXT | high/normal/low |
| `attempts` | INTEGER | |
| `max_attempts` | INTEGER | |
| `next_attempt_at` | TIMESTAMPTZ | |
| `lease_owner` | TEXT nullable | Worker ID |
| `lease_expires_at` | TIMESTAMPTZ nullable | Crash recovery |
| `last_error_code` | TEXT nullable | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Worker mengambil item menggunakan row lock/skip-locked atau pola lease ekuivalen. Stale lease dapat diklaim kembali setelah expiry.

## `idempotency_keys`

| Column | Type |
|---|---|
| `scope` | TEXT |
| `key_hash` | TEXT |
| `request_hash` | TEXT |
| `resource_id` | UUID nullable |
| `response_status` | INTEGER nullable |
| `response_body` | JSONB nullable |
| `expires_at` | TIMESTAMPTZ |
| `created_at` | TIMESTAMPTZ |

Unique `(scope, key_hash)`.

- Key sama + payload sama mengembalikan logical result yang sama.
- Key sama + payload berbeda menghasilkan `409 IDEMPOTENCY_CONFLICT`.
- Raw key tidak perlu disimpan; simpan hash.

## `message_events`

Append-only:

| Column | Type |
|---|---|
| `id` | BIGSERIAL |
| `logical_message_id` | UUID |
| `event_type` | TEXT |
| `reason_code` | TEXT nullable |
| `metadata` | JSONB |
| `occurred_at` | TIMESTAMPTZ |

Metadata tidak boleh berisi credential atau message content penuh.

## `handoff_tasks`

Pilihan menu `5` atau chatbot rule dengan action `create_handoff` membuat task:

| Column | Type |
|---|---|
| `id` | UUID |
| `session_id` | UUID |
| `contact_id` | BIGINT |
| `source_message_id` | BIGINT UNIQUE |
| `state` | TEXT |
| `assignee_user_id` | UUID nullable |
| `due_at` | TIMESTAMPTZ nullable |
| `resolved_at` | TIMESTAMPTZ nullable |
| `resolution_note` | TEXT nullable |
| `created_at` | TIMESTAMPTZ |
| `updated_at` | TIMESTAMPTZ |

Unique source message mencegah event replay membuat task ganda.

Pada implementasi Sprint 3, `session_id` belum ditambahkan karena service masih
single-session. Task dibuat ketika incoming message bernilai tepat `5`, memiliki
SLA default 24 jam, dan replay event memperbaiki task yang terlewat tanpa membuat
duplikat.

## `audit_logs`

Append-only bagi application role:

| Column | Type |
|---|---|
| `id` | BIGSERIAL |
| `actor_user_id` | UUID nullable |
| `action` | TEXT |
| `resource_type` | TEXT |
| `resource_id` | TEXT nullable |
| `reason` | TEXT nullable |
| `before_state` | JSONB nullable |
| `after_state` | JSONB nullable |
| `request_id` | TEXT |
| `ip_address` | INET nullable |
| `user_agent` | TEXT nullable |
| `occurred_at` | TIMESTAMPTZ |

Redaction dilakukan sebelum insert. Secret, QR, auth state, API key, dan full credential dilarang masuk `before_state`/`after_state`.

## `operational_events`

Timeline minimum untuk perubahan session/safety:

| Column | Type |
|---|---|
| `id` | UUID |
| `event_type` | TEXT |
| `severity` | TEXT |
| `payload` | JSONB |
| `occurred_at` | TIMESTAMPTZ |

Payload hanya berisi metadata operasional tersanitasi seperti classification,
attempt, dan expiry timestamp. Raw QR, credential, token, phone, dan message
content dilarang masuk tabel ini.

## Transaction create message

```text
BEGIN
  → validate/claim idempotency key
  → insert logical_messages(state=accepted)
  → insert outbox_messages(state=queued)
  → insert message_events(event_type=accepted)
  → bind idempotency key to logical message
COMMIT
  → HTTP 202
```

WhatsApp send terjadi setelah commit. Jika provider mungkin menerima tetapi persistence final gagal, state menjadi `unknown_outcome` dan tidak di-retry secara buta.
