# Sprint 8 UAT, Pilot, and Launch Checklist

## UAT evidence

Record owner, date, environment, pass/fail, severity, issue link, and fix target
for: general FAQ, medical, price, branch, interest, handoff, no knowledge,
document/prompt update, logs, unanswered, Analytics, permissions, anonymization,
emergency pause, and rollback. Required participants are Product, CS Admin,
Knowledge, Medical, QA, and Engineering.

## Pilot daily review

Review total/supported/fallback/handoff, unsafe or incorrect feedback, top
unanswered, latency, provider errors, cost, correction rate, overdue queue, and
incident decisions. Pilot starts at internal/5–10%; progression to 25%, 50%, or
100% requires a recorded review gate. No automatic expansion is allowed.

## Admin training

- Add/review/publish FAQ and documents; inspect extraction/chunks and re-index.
- Run Playground, import/run evaluation, read source trace and submit feedback.
- Handle unanswered and handoff queues; read Analytics/warnings/cost.
- Record release evidence, request pilot percentage, and emergency-pause AI.
- Never paste API keys into UI, tickets, knowledge, prompts, or logs.

## Production checklist

- P0 closed; evaluation, Medical, Security, UAT, Product gates passed.
- Production knowledge/source validity and one published prompt verified.
- Provider/DPA/region/pricing, budget, retention, alerts, on-call, handoff and
  knowledge owners approved.
- Backup/restore and rollback rehearsal complete; immutable tag deployed to
  production-like staging; smoke/monitoring/alert tests pass.
- Release notes, training attendance, incident contacts, and post-launch daily
  review schedule published.

## Rollback trigger

Any critical safety/cross-tenant incident, severe unsupported claim, provider
error spike, handoff failure, uncontrolled cost, or owner request forces pilot
to 0 and integration inactive. Preserve audit/evidence, then follow the Sprint 7
operations runbook before considering reactivation.

