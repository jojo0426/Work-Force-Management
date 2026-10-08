# Phase 5E.2E — Experimental Request-Start Fence

**Status: implementation checkpoint; CI pending; NOT approved for provider activation.**

The fleet service now exposes `withFencedDispatch(jobId, claimToken, callback)`. It opens a bounded Prisma transaction, locks the shared PostgreSQL control row with `FOR UPDATE`, verifies enabled state and claimed job ownership, records an admission, and **awaits the synthetic/adapter callback while holding that row lock**. `stopFleet` acquires the same row lock and therefore cannot acknowledge until the callback transaction finishes. The wired executor requires a claim token and calls the fenced dispatch method; the worker passes its claim token.

The isolated PostgreSQL CI test adds a controlled synthetic callback that pauses while a concurrent stop is attempted, verifies the stop has not acknowledged, then releases the callback and verifies stop completion. No real provider calls occur in CI.

## Safety limitations / not GREEN
- Holding a PostgreSQL transaction across network operations is a **temporary safety prototype**, not a recommended production architecture: it consumes a DB connection, serializes requests, and can time out or be interrupted.
- Prisma's bounded transaction timeout does **not** guarantee cancellation of an in-flight external request. A provider may execute after the database lock is lost; a stop may then acknowledge while the request is still active. Timeout and crash paths therefore remain unsafe.
- An adapter timeout or process crash can produce an ambiguous provider side effect and a rolled-back admission record; current retry/recovery paths are not reconciliation-safe.
- Generic custom worker handlers are not covered by the executor fence and must not be treated as approved external side-effect paths.
- No multi-process failure injection, process crash, network timeout, provider idempotency or durable drain acceptance yet.
- Integration execution remains disabled by default; no production provider activation, deployment, or main merge is authorized.

**Next:** replace this prototype with a durable out-of-transaction admission/drain protocol, explicit uncertain-outcome quarantine, provider idempotency/reconciliation, and two-replica crash/timeout E2E before any operational GREEN.
