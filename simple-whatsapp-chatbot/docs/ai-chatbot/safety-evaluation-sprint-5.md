# Sprint 5 Safety Evaluation — Provisional Engineering Report

## Status

Engineering gate: **passed locally**. Medical/Product approval gate:
**open**. The phrase policy and expected responses are provisional and must not
be represented as clinically approved.

## Automated coverage

- Deterministic pre-check: emergency, medical-personal, diagnosis, medication
  dosage, stop-treatment, prompt injection, explicit admin request, normal FAQ.
- Interest: strong next-step phrases and negative general-FAQ controls.
- Output validator: unsupported price/location, absolute result guarantee,
  diagnosis wording, stop-treatment wording, prompt leakage, length, knowledge
  source subset, and missing disclaimer.
- Runtime live smoke: disclaimer from knowledge metadata, bounded follow-up
  memory, cross-session memory isolation, emergency/provider short circuit,
  medical safe response, explicit admin request, interest handoff, and duplicate
  handoff replay.

The provisional automated dataset contains Indonesian formal/informal variants
and common spelling variants. It is intended to catch software regressions, not
to measure clinical sensitivity or specificity.

## Live acceptance result

| Scenario | Result |
|---|---|
| Emergency | Provider skipped; safe response; high-priority handoff |
| Medical dosage/diagnosis | Provider skipped; disclaimer; handoff |
| Prompt injection | Provider skipped; prompt/context not exposed |
| Explicit admin | `admin_required`; handoff created |
| Customer interest | Interest signal and handoff created |
| Duplicate emergency message | Same trace/handoff replayed |
| Follow-up in same session | Previous bounded exchange included |
| Same customer, different session | Zero history reused |

## Open approval work

RAHO Medical/Product/Knowledge owners must approve:

1. clinical phrase list, misspellings, false-positive tolerance, and escalation;
2. emergency and medical-safe wording, local emergency destination policy;
3. disclaimer text and retention/minimum-necessary policy;
4. reviewed adversarial and medical evaluation dataset with agreed targets;
5. operating hours, handoff SLA, and notification ownership.

Customer WhatsApp AI remains hard-off until those gates and release approval are
recorded.
