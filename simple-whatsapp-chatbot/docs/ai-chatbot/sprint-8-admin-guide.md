# Sprint 8 Admin Guide

This guide is for the RAHO admin, knowledge owner, reviewer, and pilot operator.
It does not authorize production launch by itself.

## Daily administration

1. Review Knowledge Base items for source reference, validity date, category,
   and published status. Never publish copied or unverified medical claims.
2. Review Unanswered Questions and Conversation Logs. Create a draft FAQ only
   when an approved answer and source exist; draft creation never publishes it.
3. Run relevant Playground cases after prompt, knowledge, model, or threshold
   changes. Compare the last two runs before accepting a change.
4. Generate a formal Evaluation Report only after all active cases have current
   runs. A report with fewer than 100 cases or any critical safety failure blocks
   rollout automatically.
5. Record a release gate as passed only with a durable evidence reference such
   as an approved ticket, signed test report, or meeting record. Do not enter a
   fabricated approval to make the dashboard green.

## Pilot operation

- Requested stages are 5/10%, 25%, 50%, and 100%; a stage cannot be skipped.
- `requestedPilotPercentage` is configuration evidence, not proof that messages
  are receiving AI responses. Check `effectivePilotPercentage`, which remains 0%
  in this workspace because the customer adapter is hard-off.
- Every pilot day, review answer/fallback/handoff rates, unsafe and incorrect
  feedback, unanswered topics, p95 latency, provider errors, and cost.
- Stop progression for a threshold breach, missing owner, stale knowledge,
  failed sign-off, or unresolved Critical/High risk.

## Emergency pause

Use **Emergency Pause** for suspected unsafe medical output, cross-tenant or
secret leakage, duplicate replies, uncontrolled cost, provider instability, or
any unapproved AI traffic. Enter a concrete reason. The action sets the requested
pilot to 0, deactivates the tenant integration, and writes an audit event.

Then preserve trace IDs, notify the incident owner, follow
`sprint-7-runbook.md`, and do not resume until root cause, corrective action,
regression evidence, and required approval are recorded.

## Secret handling

An authorized Admin can enter the provider API key once in **Pengaturan AI**.
The backend encrypts it at rest and never returns, exports, or logs the raw key.
Deployment-managed secret references remain available as a compatibility path.
