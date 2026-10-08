# Phase 5E.2AC — Provider-Independent Dispatch Fencing Design and Adversarial Validation

**Status:** Design model and CI tests implemented; production integration remains disabled. This phase does not claim strict external shutdown.

## Architecture and trust boundaries

The current PostgreSQL fleet singleton serializes admission against STOP with row locks and generation changes. A dispatch records `MAY_HAVE_DISPATCHED` and `IN_FLIGHT` before the adapter callback. However, the external network request can begin later than the database transaction commit. Neither an expiring lease, a heartbeat, nor a generation check immediately before a socket send makes that send atomic with STOP.

The provider-independent contract is therefore **ADMISSIONS_CLOSED**, never **EXTERNAL_QUIESCENCE_VERIFIED**, unless a separately audited external provider fencing protocol is demonstrated. An unresolved `IN_FLIGHT` or `UNCERTAIN` record remains quarantined and cannot be retried automatically. Empty local ledgers are insufficient proof of remote quiescence.

## Explicit state model

`NOT_ADMITTED → AUTHORIZED → SEND_INTENT_DURABLE → REQUEST_MAY_HAVE_STARTED → CONFIRMED_COMPLETE`

Any uncertain or interrupted attempt moves to `OUTCOME_UNKNOWN` for operator reconciliation. STOP increments generation and rejects new admissions, but does not erase durable intent or retroactively revoke a sender already past authorization.

The source-only model `integration-dispatch-fence-contract.ts` and `integration-dispatch-fence-contract-selftest.ts` cover:
- Matching versus stale/future generation; admission denied after STOP.
- No simulated external start without durable intent.
- A paused sender starting after STOP acknowledgment (known counterexample).
- No upgrade of stop contract to provider quiescence through local observation or caller assertion.
- Duplicate send-intent rejection and uncertain outcome remaining conservative.

The independent two-connection PostgreSQL integration test from 5E.2AB remains in CI to demonstrate the real transaction/callback interleaving. These tests do not send provider traffic.

## Stronger shutdown alternatives for future authorization

**Option A — Provider-enforced fence:** A provider validates a durable monotonically increasing generation/token on every request and refuses stale generations. Before acknowledging external quiescence, STOP must receive independently verifiable confirmation that the provider's rejection boundary is active and all previously accepted requests are complete or safely accounted for. Local tokens alone do not achieve this.

**Option B — Explicit worker quiescence:** Coordinate every process, prevent any new socket-send starts, wait for bounded in-flight work, and independently verify completion/uncertainty with provider status endpoints. A crashed or partitioned process cannot be assumed drained merely because its lease expired; the protocol needs provider-side idempotency and reconciliation.

**Option C — Conservative operations:** Retain admission-only STOP, quarantine all uncertain attempts, never claim external quiescence, and require manual provider-side confirmation before reactivation. This is the currently supportable contract.

## Required acceptance evidence

1. Multi-replica concurrency with pause before socket send and STOP on another replica.
2. SIGKILL/restart, network partition, PostgreSQL outage, and timeout cases.
3. Duplicate idempotency key and delayed provider response cases.
4. Independent provider status verification and key/token lifecycle if claiming strict quiescence.
5. Written operator runbook with accurate STOP acknowledgment semantics and separate approval before enabling any real integration.

**Gate result:** G1 remains OPEN / production NO-GO. This phase formalizes and regression-tests the boundary; it does not replace the production dispatch executor or deploy a new external fence.
