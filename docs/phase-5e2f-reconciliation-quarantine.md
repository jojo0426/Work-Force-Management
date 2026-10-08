# Phase 5E.2F — Reconciliation Quarantine Foundation

**Status: PARTIAL IMPLEMENTATION / CI PENDING. Not production-safe.**

- Corrected a Phase 5E.2E regression: adapter results were discarded by the executor's new callback wrapper, causing existing permanent/retryable error-classification tests to fail.
- Stale PROCESSING jobs with a committed `IntegrationAdmission` record are now moved to `RECONCILIATION_REQUIRED` instead of automatically returning to PENDING. Claim ownership is released and retry count is not increased.
- Added a deterministic mock regression test for admitted vs never-admitted stale claims, and registered it in GitHub Actions.

**Critical remaining gap:** The current `withFencedDispatch` stores admission and executes the adapter inside the same database transaction. If the adapter throws, the transaction times out, or the process crashes, that admission can roll back **even if the provider received the request**. Therefore the recovery check can miss an external attempt and blindly retry it. The quarantine change alone does not close this risk. The prototype is not approved for real providers.

**Next required work:** Persist an admission/attempt marker before any external request in an independent committed transaction, implement a durable in-flight/drain and request-start fence with safe stop acknowledgement semantics, quarantine all ambiguous outcomes, add provider idempotency/reconciliation, and run crash/timeout multi-replica PostgreSQL tests. No real sandbox activation, production execution or main-branch merge.
