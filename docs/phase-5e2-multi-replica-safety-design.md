# Phase 5E.2 — Multi-Replica Shutdown and Retry Safety

**Status: DESIGN / NOT YET IMPLEMENTED.** Phase 5E.1 mock-only CI #321 passed. This document does not authorize external calls.

## Existing limitations
- `IntegrationPolicyService.emergencyStop()` is per-process and reset by restart.
- `IntegrationWorkerService.runOnce()` claims a job before checking any shared fleet-wide pause.
- `IntegrationExecutorService.execute()` evaluates process-local policy before invoking an adapter; no central gate.
- A timeout may race a provider side effect; retries cannot safely assume no action occurred.
- `IntegrationJob` already records claim tokens and idempotency keys, but does not establish provider-side deduplication.

## Proposed shared control plane
Use a persistent PostgreSQL control row, not in-memory flags or a process-local environment variable.

Control fields: singleton identifier, `enabled=false` by default, monotonically increasing `generation`, `stoppedAt`, `stoppedBy`, `reasonCode`, and `updatedAt`. Do not store secrets or subscriber data in control metadata.

**Fail closed:** missing row, DB read failure, unknown generation, or stale policy snapshot blocks dispatch. No remote re-enable endpoint in this phase. Re-enabling requires a separately reviewed operational procedure.

## Safety gates (all required before a provider invocation)
1. Scheduler checks shared control **before** claiming jobs; disabled means no new claims.
2. Worker checks shared control **after** claim and **before** handler execution. Disabled claims are returned to a retryable paused state without incrementing failure retries.
3. Executor checks shared control immediately before calling an adapter. Every execution path, including manually registered handlers, must be protected.
4. Prevent stop-vs-dispatch races using a transactionally enforced admission/lease protocol, not just two independent reads. Stop must fence new admissions before acknowledging completion.
5. On stop, already admitted requests may still be in flight. Track and drain/cancel them where supported; report unresolved attempts rather than claiming rollback.
6. Reconcile uncertain attempts by a provider-confirmed idempotency key or status query **before** any replay. Never automatically retry ambiguous effects without such a guarantee.

## Acceptance test matrix
- Two independent worker instances see a stop and start no new mock calls after the stop acknowledgment.
- Concurrent stop and dispatch cannot bypass the admission fence.
- Restarted instances stay disabled; DB failure and absent control row fail closed.
- Claimed-but-not-dispatched jobs remain durable and do not consume retry budget.
- Stale claim tokens cannot complete or fail a newer owner's job.
- Two workers racing for the same job cannot both invoke a provider.
- Timeout after potential side effect enters reconciliation-required state, not blind retry.
- Stop is audited with actor, reason, generation and time, without secrets or PII.

## Implementation order
1. Add Prisma model and migration for central policy and per-attempt admission records.
2. Add shared policy repository, fenced admission and one-way stop operations.
3. Wire scheduler, worker and executor with a single fail-closed contract.
4. Add isolated Postgres two-replica concurrency and crash-recovery tests.
5. Gate feature-branch CI; only then mark 5E.2 GREEN.

## Non-goals and restrictions
No production activation, no real sandbox traffic, no live provider credentials, and no merge to `main` without explicit user approval. In-memory tests alone cannot satisfy the distributed acceptance gate.
