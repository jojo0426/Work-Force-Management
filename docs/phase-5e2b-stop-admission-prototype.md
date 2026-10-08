# Phase 5E.2B — Shared Stop and Admission Prototype

**Status: IMPLEMENTED AS AN UNWIRED PROTOTYPE; NOT OPERATIONALLY SAFE OR GREEN.**

- `IntegrationFleetControlService.stopFleet(actor, reasonCode)` acquires the PostgreSQL `IntegrationFleetControl` singleton row with `FOR UPDATE`, disables it and increments its generation. Missing row is **not** reported as successful stop. No enable endpoint was added.
- `reserveAdmission(jobId, claimToken)` uses the same row lock, verifies a currently PROCESSING job's claim token, and records an admission. Missing row, disabled control, and database errors fail closed.
- Mock selftest covers identity validation, stale claims, disabled control and stop generation. CI is necessary but insufficient.

## Critical unsatisfied safety properties
1. **Dispatch race:** A worker can reserve, commit, pause, then initiate a provider call *after* stop acknowledgement. The row lock only orders reservation against stop; it does **not** fence actual request start.
2. **Not wired:** Scheduler, worker and executor do not consume the shared gate or admission records. Existing process-local controls remain in place.
3. **No durable admission release/drain:** Outstanding requests are not tracked through completion, cancellation or reconciliation.
4. **No database concurrency E2E:** Two-replica stop races, transaction isolation and restart recovery are not verified.
5. **No retry reconciliation:** Timeout or crash may have caused a provider side effect; blind replay remains unsafe.

**Required before Phase 5E.2 can be GREEN:** implement a fenced dispatch protocol that prevents new request starts after stop acknowledgement, wire all execution paths, add durable attempt lifecycle and ambiguous-outcome reconciliation, and run isolated PostgreSQL concurrency E2E.

**Operational policy:** No provider activation, no production deployment and no merge to main without explicit user authorization.
