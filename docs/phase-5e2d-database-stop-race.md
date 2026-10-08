# Phase 5E.2D — PostgreSQL Stop/Admission Race Test

**Status: isolated database test committed; CI pending. Full Phase 5E.2 remains IN PROGRESS.**

A GitHub Actions-only database test exercises missing-control fail-closed behavior, concurrent reservation and stop against the same PostgreSQL row, generation increments, persisted disabled state and post-stop admission rejection. It uses only a synthetic queued job; no provider adapter is called. The test refuses to run outside GitHub Actions with a database URL ending in `/wfm_ci`, creates a temporary enabled singleton only inside that isolated CI database, and removes fixtures afterward.

**Scope limitation:** This test verifies database reservation ordering, not actual network dispatch. The existing `reserveAdmission` method is not wired to the executor, and even wiring it as-is would not prevent a worker from pausing between reservation commit and request start. A correct fleet-wide stop must define and enforce an admission/request-start fence, track in-flight attempts and reconcile ambiguous outcomes. No live-provider credentials, real sandbox calls, production enablement, or main-branch merge are authorized.

**Next:** design a transactionally fenced request-start/stop protocol with bounded in-flight leases, wire it into every adapter invocation, and add two-instance tests that demonstrate no new request start after stop acknowledgment. Do not claim operational fleet-wide safety until proven.
