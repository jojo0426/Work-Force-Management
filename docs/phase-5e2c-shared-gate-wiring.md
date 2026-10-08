# Phase 5E.2C — Shared Gate Wiring Checkpoint

**Status: WIRED PRELIMINARY SHARED STOP CHECKS; NOT FLEET-WIDE SAFETY ACCEPTED.**

The NestJS integration module now provides `IntegrationFleetControlService` to the orchestrator, worker and executor. The orchestrator checks shared state before recovery/dispatch; the worker checks before and after claiming; and the executor checks before adapter lookup. A stopped worker returns a claimed job to PENDING without spending its retry budget. Missing/disabled/unavailable shared control fails closed.

A mock-only wiring selftest checks the three entry points, an after-claim stop and blocked adapter invocation. Existing direct-construction unit tests may omit the optional gate; those instances are **not** protected by fleet control.

## Critical unresolved gates
- These are asynchronous shared-state reads, **not a fenced request-start protocol**. A stop may be acknowledged between the last read and actual adapter invocation.
- The `reserveAdmission` prototype is not yet used for real dispatch; its reservation commit does not close the race.
- No two-replica PostgreSQL race E2E, lease-drain mechanism, or uncertain-side-effect reconciliation is verified.
- Paused claims return to PENDING and may be re-claimed; worker-level pause is not a substitute for transactional scheduler fencing.
- No real provider sandbox or production integration is authorized.

**Next checkpoint:** Implement admission start fencing and durable in-flight lifecycle, including stop/drain semantics, then prove stop-vs-dispatch races using isolated PostgreSQL two-worker tests. Do not mark Phase 5E.2 GREEN before these pass.
