# Phase 5E — Sandbox Operational Acceptance

**Status:** IN PROGRESS — planning and mock-only evidence. No real provider or production activation is authorized.

**Baseline:** Phase 5D PR #3 merged to main at `b5bf6e90a180760f04927abe89725dec590bb4c2`. Post-merge GitHub Actions #319 completed successfully across backend, web and mobile.

## Goal
Produce verifiable operational acceptance evidence for controlled external integrations without confusing mock CI results with real provider readiness.

## 5E.1 — Provider-specific acceptance inventory
- Identify the intended external provider, sandbox endpoint, API authentication mechanism, required scopes, rate limits, idempotency behavior, and approved operator.
- Keep credentials and subscriber PII outside the repository and CI logs.
- Define synthetic sandbox-only request/response examples and expected terminal/transient classifications.
- **Gate:** provider owner and sandbox contract approved before making real outbound requests.

## 5E.2 — Multi-replica shutdown and retry safety
- Define how a central disable state propagates to all worker replicas; the Phase 5D in-process emergency stop alone is not sufficient.
- Verify pending jobs remain durable, no new provider calls start after stop, and ambiguous in-flight calls are reconciled by idempotency key before replay.
- Exercise stale claims, concurrent workers, retries exhausted and crash recovery in isolated database E2E.
- **Gate:** no production activation until a distributed kill-switch and scheduler pause mechanism are implemented and drilled.

## 5E.3 — Monitoring and recovery drills
- Specify durable distributed telemetry for queue depth, age, claim failures, timeout rates, retries and terminal errors.
- Exercise alert delivery and escalation using synthetic events, and record observed operator response.
- Capture rollback timings, recovery steps, and unresolved incidents without secrets.
- **Gate:** operator drill evidence, not just unit-test counters.

## 5E.4 — Acceptance and approval
- Run existing Phase 5C/5D regressions and new Phase 5E checks through GitHub Actions.
- Capture CI run IDs and separate sandbox evidence: timestamps, environment, provider, outcomes, owner, and redacted proof.
- Require security review, operations owner, rollback approval, and explicit user approval for any merge.
- **Separate authorization required:** merging code never enables live providers or constitutes production deployment approval.

## Starting limitations
- Phase 5D CI uses mock providers and an in-memory metrics service; it does not establish live sandbox compatibility.
- Emergency stop is one-way per process; it is not a fleet-wide stop and cannot reverse already committed provider actions.
- Mobile production dependency audit remains non-blocking in baseline CI.
- No real sandbox credentials, distributed alerting or completed rollback drill have been verified.

## Execution order
1. Record the exact provider-specific acceptance contract and safety constraints.
2. Build/test fleet-wide fail-closed controls using mock workers and isolated database fixtures.
3. Implement distributed monitoring/alert delivery with privacy-safe aggregation.
4. Conduct approved sandbox and operator drills; document results.
5. Review CI and acceptance gates before any PR merge or environment activation.
