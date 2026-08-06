# Sprint 8 Handover Pack

This pack is completed by the accountable RAHO owners during staging, UAT,
pilot, and production. Blank evidence is a blocker, not permission to launch.

## Knowledge governance SOP

1. Author creates a draft with category, official source reference, validity,
   disclaimer requirement, and question variants.
2. Knowledge reviewer checks accuracy, duplicates, obsolete content, tone, and
   ownership. Medical content also requires the named Medical Reviewer.
3. Approver records review and publishes one version. Authors do not bypass the
   approval workflow; publishing automatically queues re-indexing.
4. Operator reviews extraction/chunks and runs internal search plus related test
   cases. Incorrect chunks are fixed in a new version, never edited in place.
5. Review unanswered topics weekly and expiring content monthly. Archive stale
   facts immediately; re-index and regression-test every affected topic.

## Tuning report template

| Field | Required evidence |
|---|---|
| Change ID / date / owner | Ticket and accountable reviewer |
| Baseline | Dataset version, prompt/knowledge versions, model, Top-K, threshold, context count |
| Hypothesis | The specific retrieval, prompt, validator, or interest-detector problem |
| Change | Versioned setting/content change; never an untracked production edit |
| Result | Accuracy, retrieval, handoff, errors, critical safety, fallback, latency, cost |
| Regression | Safety, unsupported, injection, cross-tenant, old-topic cases |
| Decision | Accept/reject/rollback and reviewer evidence |

Do not tune only against a failing example. Re-run the full approved dataset and
reject any improvement that weakens critical safety or tenant isolation.

## Pilot report template

Record stage/channel, start/end, dataset/report ID, deployed versions, total and
supported conversations, fallback/handoff rates, unsafe/incorrect feedback,
unanswered topics, p95 latency, provider/system errors, cost, queue SLA, incidents,
admin corrections, Medical review, and the decision to stop/hold/advance.
Attach the daily-review exports and evidence gate revision. Expansion is manual
and sequential: 5/10% → 25% → 50% → 100%.

## Troubleshooting

| Symptom | Check | Safe action |
|---|---|---|
| `EVALUATION_GATE` | Active case count, latest run, report blockers | Fix data/version, rerun cases, generate a new report |
| `KNOWLEDGE_NOT_READY` | Published count and missing source | Add verified source/review; publish and re-index |
| `PROMPT_NOT_READY` | Published prompt versions | Approve/publish exactly one version |
| `PRODUCTION_PROVIDER_MISSING` | Redacted provider credential status | Configure the API key through Pengaturan AI or an approved deployment secret reference |
| `GATE_*` | Evidence status, owner, ticket/report | Obtain real review; record evidence with current revision |
| `AI_RELEASE_REVISION_CONFLICT` | Another admin changed readiness | Refresh, review the new state, then retry intentionally |
| `AI_PILOT_STEP_INVALID` | Current requested stage | Advance only one stage or return to 0 |
| Safety/tenant/secret incident | Trace ID and affected scope | Emergency pause, preserve evidence, follow incident runbook |

## Incident contacts

Before pilot, replace every blank and store the approved contact schedule outside
the source repository:

| Role | Primary | Backup | Channel / hours |
|---|---|---|---|
| Incident commander | _required_ | _required_ | _required_ |
| Engineering on-call | _required_ | _required_ | _required_ |
| Product Owner | _required_ | _required_ | _required_ |
| Medical Reviewer | _required_ | _required_ | _required_ |
| Knowledge Owner | _required_ | _required_ | _required_ |
| Handoff/CS Owner | _required_ | _required_ | _required_ |
| Security/Privacy | _required_ | _required_ | _required_ |

## Release notes template

- Release/build and migration identifiers.
- Prompt, knowledge, model, embedding, and operations-setting versions.
- Evaluation/UAT/Medical/Security/Product evidence references.
- Requested and effective pilot scope, named owners, budget, and alert routing.
- Known limitations: strict official-source grounding, no medical diagnosis or
  personal recommendation, fallback/handoff behavior, and emergency-pause path.
- Rollback command/runbook reference and post-release review schedule.

## Post-launch review plan

- Daily during each rollout stage and for seven days after 100%: all pilot
  metrics, every unsafe/incorrect item, top unanswered, incidents, and queue SLA.
- Weekly for the first month: knowledge freshness, tuning drift, provider/model
  changes, cost/budget, permissions, alerts, and unresolved risks.
- Monthly thereafter: risk register, retention/privacy workflow, owner coverage,
  dependency audit, restore rehearsal schedule, and dataset refresh.
- Any Critical safety/security/privacy or unapproved-traffic finding immediately
  returns requested traffic to 0 and blocks progression pending formal review.
