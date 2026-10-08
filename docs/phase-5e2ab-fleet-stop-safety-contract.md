# Phase 5E.2AB — Fleet Shutdown Safety Contract and Two-Replica Validation

**Scope:** Formal stop semantics, synthetic two-connection PostgreSQL race demonstration, and fail-closed acceptance criteria. **No real provider traffic, no production activation.**

## Contract: what STOP means

- `stopFleet()` locks the global control row, disables admission, increments generation, records actor/reason and commits. A successful acknowledgment means **future admission transactions acquiring the gate lock cannot succeed while disabled**.
- `withFencedDispatch()` first durably writes `MAY_HAVE_DISPATCHED`, then commits `IN_FLIGHT` under the same lock. It **does not hold the lock while the callback executes**.
- A callback authorized before STOP may begin its actual network request **after STOP acknowledges**, or remain active after STOP. A PostgreSQL commit is not atomic with external I/O. Therefore **STOP acknowledgment is not proof of zero new network sends**.
- `inspectStopSafety().externalQuiescenceVerified` and `stopAndInspect().externallyDrained` remain **false**. Even `inspectDrain().drained=true` means *ledger-only drained*, never independently observed provider quiescence.
- A missing control row, unavailable DB, disabled gate, mismatched claim, or stale generation must fail closed for new admissions. No remote enable route is permitted.
- Crash, timeout, network ambiguity, and interrupted callbacks retain durable uncertain state; no automatic replay, optimistic reconciliation, or release on timeout alone.
- Acknowledged stop and a drained ledger are different operational states. Operators must not announce provider quiescence without external proof.

## Test contract: Phase 5E.2AB

`integration-fleet-stop-contract-database-e2e.ts` is GitHub Actions-only, restricted to `/wfm_ci` and **uses no adapter or HTTP network call**. Two independent Prisma connections simulate replicas A and B. It:
1. Creates a synthetic claimed MOCK job and temporarily enables the fleet in disposable CI.
2. Authorizes a dispatch on A but pauses its callback **before simulated network start**.
3. Stops fleet on B, confirms acknowledgment and unresolved attempts, and verifies neither replica claims external quiescence.
4. Releases the callback **after stop acknowledgment**, proving the post-acknowledgment request-start counterexample is possible.
5. Confirms the prior callback can finish, its durable admission remains `IN_FLIGHT` until explicit settlement, and new admissions are blocked after stop.

**Interpretation:** Passing this test confirms the system accurately exposes its safety limitation; it does **not** establish strict shutdown or authorize production. Existing tests separately cover stop/admission races, crash persistence, and reconciliation.

## Exit gate for strict external shutdown

Before any claim of strict shutdown, define and implement one of:
- A provider-enforced request-start fence with durable token/generation semantics and documented acknowledgment guarantees; **or**
- A separately verified drain-and-quiesce protocol that fences workers, tracks every live request, waits for bounded termination, and confirms externally with the provider that no new requests can start.

Required independent proof: multi-replica stop/dispatch scheduling, SIGKILL before/after network start, network timeouts, provider responses after stop, DB outage, restart, orphaned leases, duplicate idempotency keys, and adversarial pause between last local check and socket send. Without provider support, a strong no-post-acknowledgment-send guarantee may be impossible; explicitly retain a conservative stop contract instead.

## Operational decision

**G1: OPEN — production NO-GO.** This phase adds evidence and a reproducible counterexample; it deliberately does not change production dispatch behavior or claim external quiescence. No real provider sandbox authorization, merge to main, or deployment.
