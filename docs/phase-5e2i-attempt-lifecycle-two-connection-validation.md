# Phase 5E.2I — Durable Attempt Lifecycle and Two-Connection PostgreSQL Validation

**Status: implementation checkpoint, CI pending; not operationally approved.**

Implemented two conservative persisted lifecycle transitions on `IntegrationAdmission`:

- `markAttemptInFlight(admissionId, jobId, claimToken)`: transactionally locks the fleet singleton, verifies enabled state, job ownership and matching generation, then transitions `MAY_HAVE_DISPATCHED` to `IN_FLIGHT`.
- `markAttemptUncertain(admissionId, jobId, claimToken)`: persists `UNCERTAIN` from `MAY_HAVE_DISPATCHED` or `IN_FLIGHT`. Neither state is eligible for automatic retry.

Expanded the isolated PostgreSQL E2E to create a **second independent PrismaClient connection**, observe committed admissions, transition an attempt to `IN_FLIGHT`, mark it `UNCERTAIN` through the first client, and verify cross-connection persistence. The test also checks that a stopped fleet with unresolved attempts does not report drained.

**Boundaries:** Two Prisma connections are NOT two running backend processes. No process-kill, lost-DB-lock, network timeout, or external provider test has been performed. The new lifecycle transitions are foundations and are not yet integrated into the adapter callback path. The existing executor still holds a transaction lock across callback execution, which can be lost during timeout while external effects continue. `inspectDrain` is ledger-only, not a verified network-drain guarantee.

**Next required:** integrate lifecycle transitions with the actual executor without an unsafe gap; model leases/heartbeats and conservative timeout classification; build genuine two-process PostgreSQL crash/timeout fault injection and provider idempotency/reconciliation. No real providers, no main merge.
