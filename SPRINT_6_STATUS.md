# Sprint 6 — Safety Center dan Recovery Workflow

Status: selesai diimplementasikan.

## Output

Operator dapat melihat alasan block/delay, rekomendasi, timer, dan histori event
tanpa membuka terminal. Admin dapat melakukan resume/reset melalui workflow
guarded yang memerlukan permission, CSRF, step-up password, alasan, konfirmasi,
recovery guard, dan audit.

## Backend

- Typed Safety Center adapter untuk health, rate, warm-up, timelock, recovery,
  delivery, retry/reconnect, counters, config, dan capability state.
- Durable singleton `safety_control_state`; manual pause direstore saat startup.
- Outbox safety-delay tidak menghabiskan attempt dan mencatat reason code,
  recommendation, serta next attempt.
- Error policy dari `baileys-antiban` dipetakan ke event tersanitasi, bukan blind
  retry atau `unknown_outcome`.
- Admin-only resume/reset dengan exact acknowledgement/confirmation dan password.
- Recovery paused/dead dan timelock menjadi hard guard.
- Reset default-off (`SAFETY_RESET_ENABLED=false`) dan tetap manual pause.
- Reset hanya eligible ketika health/recovery/timelock clear dan counter
  rate/warm-up nol, sehingga tidak dapat dipakai menambah budget pengiriman.
- Prometheus endpoint memakai ratio 0..1 dan menghilangkan metric modul unavailable.

## Frontend

- Route `/operations/safety`.
- State pause/risk dan active blockers dengan reason/recommendation.
- Rate, warm-up, timelock, recovery, delivery, dan optional-module capability.
- Recent delay deep-link ke message timeline.
- Policy conservative read-only.
- Operator pause; Admin guarded resume/reset.
- Disabled/not-instrumented/unavailable tidak ditampilkan sebagai angka nol.

## Verification

- Unit test risk mapping, feature honesty, recovery guard, persistence, dan outbox
  safety delay.
- Route test RBAC, acknowledgement, step-up, audit, dan reset confirmation.
- UI test operator/admin boundary, disabled-module state, guarded resume, dan
  reset feature flag.
