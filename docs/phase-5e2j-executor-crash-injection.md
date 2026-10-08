# Phase 5E.2J — Executor Boundary and Synthetic Worker Crash

**Status: CI pending; experimental and NOT provider-safe.**

The fenced executor callback now attempts the `MAY_HAVE_DISPATCHED -> IN_FLIGHT` transition before invoking its callback, within the second dispatch transaction. The independently committed `MAY_HAVE_DISPATCHED` marker from Phase 5E.2G remains durable if that transaction rolls back.

The isolated PostgreSQL test launches a **separate Node.js process** with its own Prisma connection, enters a synthetic callback, terminates the child process with SIGKILL, and checks that the committed attempt marker remains. The test uses no network or provider credentials. A separate two-client test already verifies cross-connection `UNCERTAIN` persistence.

**Known limitations:** The `IN_FLIGHT` transition is part of the callback transaction and may roll back on crash; the durable marker conservatively remains `MAY_HAVE_DISPATCHED`. The parent process is a test controller, not a fully deployed second backend instance. The test does not inject actual provider network timeouts or verify idempotency. The callback still executes under a PostgreSQL row lock; timeout can release the lock while external work continues. The synthetic test demonstrates persistence, not end-to-end shutdown safety.

**Next:** remove the lock-across-network approach; introduce committed request-start lifecycle and explicit stop/drain semantics; validate provider idempotency and reconciliation with realistic timeout faults. Do not merge or activate external providers.
