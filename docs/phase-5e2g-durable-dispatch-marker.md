# Phase 5E.2G — Durable Pre-Dispatch Marker (Experimental)

**Status: implemented on feature branch, CI pending. NOT operationally approved.**

The fleet dispatcher now uses two separate transactions. The first transaction acquires the shared fleet-control lock, verifies enabled state and claimed-job ownership, and commits a durable `MAY_HAVE_DISPATCHED` admission marker **before invoking any adapter callback**. The second transaction re-acquires the lock and verifies the same fleet generation and claim before running the callback. If stop wins between transactions, the callback is rejected and the conservative marker remains.

Both explicit job failure and stale-claim recovery now quarantine jobs with committed admission records as `RECONCILIATION_REQUIRED`, instead of blindly replaying them. The isolated PostgreSQL test adds a synthetic callback failure and asserts the marker survives transaction rollback.

**Critical limitations:**
- The second transaction still holds a database lock during the callback. Database disconnection or transaction timeout may release that lock while an external request remains in progress. Thus stop acknowledgment is **not** yet a reliable network-request drain guarantee.
- A marker can remain even when dispatch never started. This is intentional fail-safe over-quarantine; operator/provider reconciliation is needed.
- A successful adapter response and subsequent job completion are not atomically committed. Crashes may quarantine completed external effects.
- No provider idempotency keys or read-after-write reconciliation protocol have been validated.
- Custom handlers outside the executor may bypass the fence.
- No actual provider calls or real activation. Do not merge into main.

**Next:** replace the lock-across-network approach with durable attempt lifecycle and stop/drain acknowledgement semantics, add crash/timeout fault injection, and prove behavior with independent workers and provider-idempotency tests.
