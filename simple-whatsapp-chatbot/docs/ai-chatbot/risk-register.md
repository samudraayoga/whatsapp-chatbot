# Risk Register — Integrasi Chatbot AI RAHO

## Status and scoring

This register starts at Sprint 0 and is reviewed during refinement, sprint
review, and pilot daily review.

| Probability | Meaning |
|---|---|
| Low | Unlikely within the current release |
| Medium | Plausible; prepare mitigation |
| High | Expected without active intervention |

Impact uses `Medium`, `High`, or `Critical`. An owner role is not a named owner;
items marked **Blocked owner** need an accountable person before Sprint 0 can
fully close.

## Register

| ID | Risk | Probability | Impact | Mitigation / prevention | Trigger / indicator | Owner | Status |
|---|---|---:|---:|---|---|---|---|
| R-001 | Knowledge not ready or incomplete | High | High | Sprint 2 governance tooling and 12-category seed; assign owner/category/source/validity; weekly review; unanswered workflow | Low coverage, repeated fallback, missing approved source | Knowledge Owner | Tooling implemented; content/owner blocked |
| R-002 | Hallucination or unsupported fact reaches customer | Medium | Critical | Strict grounding, no-context short circuit, source trace, structured output, validator, evaluation | Unsupported claim, source mismatch, rising correction rate | AI Lead + QA | Grounding and deterministic validator implemented; formal evaluation approval pending |
| R-003 | Unsafe medical statement, diagnosis, or promised result | Medium | Critical | Medical reviewer, safety pre-check, reviewed prompt/copy, validator, disclaimer, pilot review | Forbidden phrase/diagnosis in evaluation or log | Medical Reviewer | Engineering controls implemented; clinical owner/copy approval blocked |
| R-004 | Retrieval misses correct knowledge | High | High | Chunk review, variants, metadata, Recall@K, evaluated threshold, re-index/version metrics | Low Recall@K, low similarity despite known answer | AI Lead | Internal search implemented; evaluation planned |
| R-005 | Cross-tenant data/knowledge leak | Low | Critical | Server-derived tenant, mandatory predicates, vector/cache/job tenant keys, negative tests, security review | Tenant canary hit or resource-ID access succeeds | Tech Lead + Security | Document/vector/job predicates implemented; broader runtime tests planned |
| R-006 | AI cost exceeds budget | Medium | High | Mini model, context/history/output limits, cache, quotas, token/cost metrics and alerts | Token/cost per conversation or daily budget threshold exceeded | Product + FinOps | Budget blocked |
| R-007 | Response latency harms WhatsApp experience | Medium | High | Async non-chat work, vector index, bounded context, cache, provider timeout/circuit breaker, fallback | Runtime p95/SLO breach, queue/provider latency spike | SRE + AI Lead | SLO blocked |
| R-008 | Provider outage/rate limit/invalid output | Medium | High | Bounded retry, backoff, circuit breaker, schema validation, approved fallback model only, safe fallback | Error/rate-limit/invalid schema alert | Backend Lead | Timeout/retry/schema/safety fallback implemented; circuit breaker/provider approval pending |
| R-009 | Handoff queue accumulates or loses requests | High | High | Reuse durable `handoff_tasks`, unique source message, SLA/due time, assignment, alert, reconciliation | Overdue/open queue threshold; missing source handoff | CS Owner | Durable AI handoff and operator workflow implemented; SLA/alerts/owner blocked |
| R-010 | Admin does not maintain knowledge | Medium | High | Simple dashboard, training, ownership, expiry alert, unanswered queue, monthly review | Stale/expired items, review backlog, correction increase | Knowledge Owner | Blocked owner |
| R-011 | Prompt injection or context exfiltration | High | High | Treat input/doc as data, fixed hierarchy, no prompt/context disclosure, output validator, adversarial dataset | Injection test failure or internal content in output | Security + AI Lead | Direct pre-check, fixed boundary, validator, and provisional corpus implemented; formal review open |
| R-012 | Malicious/oversized document compromises worker | Medium | Critical | Allowlist, magic-byte/size/page limits, AV quarantine, sandbox/resource limits, private storage | Scanner/parser alert, resource spike, MIME mismatch | Security + Platform | Basic validation/EICAR hook implemented; formal scanner/sandbox blocked |
| R-013 | Knowledge poisoning or unauthorized publish | Medium | Critical | Edit/review/publish capabilities, immutable versions, source/validity, audit, alerts | Unreviewed publish, suspicious bulk change | Knowledge + Security | Technical controls implemented; role decision/alerts blocked |
| R-014 | Privacy/PII is sent to provider or retained too long | Medium | Critical | Minimize/mask, bounded history, provider DPA/region, access/retention/deletion, redaction tests | PII scan finding, deletion failure, policy breach | Privacy Owner | Blocked owner/policy |
| R-015 | Duplicate AI reply due retry/unknown outcome | Medium | Critical | Provider-message idempotency, durable trace/outbox boundary, unknown-outcome reconciliation | Same source produces multiple outgoing replies | Backend Lead | Runtime trace/handoff replay implemented; customer-send/outbox cutover remains disabled |
| R-016 | Stale knowledge remains in cache/index | Medium | High | Version-aware cache key, publish/archive invalidation, index generation, active/valid filters | Archived/expired source appears in answer | Backend + AI Lead | Index generation/archive filters implemented; runtime cache planned |
| R-017 | Feature appears enabled before dependencies/approval are ready | Medium | Critical | Startup rejects `AI_CHATBOT_ENABLED=true`; Sprint 1 adds literal effective-off, live readiness, explicit acknowledgement, audit, and fail-closed activation | Foundation reports enabled while blocker exists, or a customer provider call occurs | Product + Tech Lead | Runtime activation and customer traffic blocked; tenant pilot/kill-switch integration remains planned |
| R-018 | Migration corrupts existing messages/handoff behavior | Medium | Critical | Additive versioned migrations, reuse tables, backfill verification, rollback/roll-forward, regression | Existing tests fail, FK/backfill conflict, duplicate task | Data/Backend Lead | Additive migration and existing regression suite pass locally; production rollback rehearsal open |
| R-019 | Scope creep into booking/payment/personal advice | High | High | Explicit non-goal, route/schema negative tests, change control through Product Owner | Story/API/UX begins collecting booking/payment or selecting therapy | Product Owner | Blocked owner |
| R-020 | Observability misses unsafe or costly behavior | Medium | High | Trace/model/source/token/latency, safe metrics, alert, review dashboard, no-PII logs | Untraceable answer or delayed provider/cost incident | SRE + QA | Alpha trace implemented; dashboards/alerts pending |
| R-021 | Evaluation dataset is biased or too small | High | High | 100–300 mixed/adversarial cases, real-language patterns, Medical/Product review, versioning | Pilot errors not represented in dataset | QA + Medical | Planned/owner blocked |
| R-022 | Existing deterministic chatbot regresses during AI work | Medium | High | Separate namespace/config/flag and sidebar route implemented; preserve current regression suite; staged cutover | Existing `/chatbot/rules` or runtime behavior changes unintentionally | Tech Lead | Active mitigation |
| R-023 | Secret manager/object storage/Redis/CD delays block sprints | High | High | Local pgvector/Redis/MinIO clients, queue worker, extension, bucket, and smoke are verified; assign platform owner and production credential process | Shared-environment dependency unavailable or only locally verified | DevOps/SRE | Local complete; production owner/decision blocked |
| R-024 | Vulnerable production dependency enters release | Medium | High | Frontend/backend audit added; audit every package/submodule, patch SLA, lockfile review, secret/container scan, time-boxed exception | High/Critical audit finding | Security + Maintainer | Open anti-ban finding |
| R-025 | Model/provider behavior changes silently | Medium | High | Pin versions where supported, model metadata, canary/evaluation on change, rollback | Quality drift without application deploy | AI Lead | Provider blocked |
| R-026 | Reviewer/approver bottleneck slows delivery | High | Medium | Named backup, SLA, batch review, weekly knowledge/medical session | Review queue age exceeds sprint cadence | Product Owner | Blocked owner |

## Current concrete finding

At the Sprint 3 verification date, production dependency audit reported one High finding
in `baileys-antiban`:

```text
socks-proxy-agent@10.0.0
  → socks@2.8.7
    → ip-address@10.2.0 (advisory affects versions through 10.3.0)
```

Backend and frontend package audits reported zero vulnerabilities.
The anti-ban finding must be upgraded/remediated and fully regression-tested, or
temporarily accepted by the security owner with rationale, expiry, and compensating
controls. Auditing only the parent backend lockfile is not sufficient because the
local submodule dependency has its own lockfile.

## Escalation rules

- Critical risk trigger: disable tenant/global AI immediately, preserve trace,
  notify incident owner, and stop rollout.
- High safety/security/privacy trigger: block release/pilot progression until
  resolved or formally accepted by the accountable authority.
- Cross-tenant leak, secret leak, dangerous medical answer, or AI call while
  disabled is never treated as a tuning-only issue.
- Provider/cost/latency degradation uses safe fallback; it must not relax strict
  grounding or output validation.

## Review cadence

- Sprint planning/refinement: reassess probability, impact, owner, and mitigation
  story.
- Weekly: knowledge readiness, medical safety, provider/platform dependencies.
- Release gate: close or formally accept every Critical/High item.
- Pilot: daily review of unsafe output, fallback, retrieval miss, handoff backlog,
  latency, errors, and cost.
- Production: weekly knowledge/quality review and monthly risk review, adjusted
  after incidents.

## Decisions required to reduce risk

1. Named Product, Knowledge, Medical, Privacy/Security, Handoff, and Platform
   owners.
2. Provider/model/region and contractual data handling.
3. Retention/deletion and minimum customer data policy.
4. Handoff SLA/operating hours/assignment.
5. Upload limits/scanner/parser isolation.
6. Performance/cost budgets and alert thresholds.
7. Granular role/permission and publish authority.
8. Dependency finding owner and remediation/exception deadline.
