# Phase 5E.2K — No Lock Across Adapter Callback

**Status: experimental, CI pending. Not approved for real providers.**

The shared fleet-control service now uses **two short PostgreSQL transactions**: one to commit the `MAY_HAVE_DISPATCHED` admission marker, and one to verify the same generation/claim and commit `IN_FLIGHT`. Only after both transactions commit does the adapter callback execute, **without holding any database transaction or singleton row lock**.

A callback error attempts to persist `UNCERTAIN`; if that update fails, the committed `IN_FLIGHT` marker remains unresolved. Successful jobs are settled after durable queue completion, as in 5E.2H.

The isolated PostgreSQL E2E now asserts that `stopFleet` can acknowledge **while an already-started synthetic callback is still running**, and that `inspectDrain` remains false while unresolved records exist. The independent-process SIGKILL fixture still verifies that a durable marker survives worker termination. No provider/network traffic is involved.

## Safety semantics and remaining gaps

- **STOPPED** means new fleet admissions are disabled. It does **not** mean existing requests have completed, nor that no request can begin after the stop acknowledgement if an attempt was admitted just before stop.
- **Ledger drained** means no unresolved admission markers were observed in the database. It is **not** proof of external network quiescence or provider outcome.
- There remains a small post-commit/pre-callback window where stop can acknowledge and a previously authorized callback can subsequently begin. Production-safe stop semantics require a stricter dispatch-start handshake or explicit pre-stop in-flight drain/epoch protocol.
- A callback may finish after the stop acknowledgement; external cancellation is not guaranteed.
- The worker's generic custom-handler path is not yet forced through this fleet fence.
- No provider idempotency/reconciliation contract, real network timeout injection, or full two-deployed-replica test has passed.
- No production activation or merge to main.

**Next:** eliminate post-stop request-start ambiguity with a defined provider-start protocol, enforce executor-only external handlers, validate two-process restart/timeout recovery and idempotent reconciliation before operator acceptance.
