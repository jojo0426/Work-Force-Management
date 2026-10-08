# Phase 5E.2AD — Multi-Replica Worker Quiescence Protocol and Failure-Recovery Design

**Status:** Protocol design and deterministic synthetic regression implemented. No runtime worker coordination deployed. Real provider execution remains disabled.

## Safety objective and boundary

A STOP acknowledgment only closes new PostgreSQL admissions. Workers already authorized may pause before a socket send, and crashed or partitioned workers cannot be assumed inactive because their heartbeat expired. An empty ledger, zero active callbacks, or all local workers acknowledging STOP does not independently prove external provider quiescence.

The new `integration-worker-quiescence-contract.ts` provides a **pure read-only assessment model** for future coordination. It never marks `externallyQuiescent=true` and is not wired to the runtime worker service.

## Proposed protocol (not implemented)

1. **Register replicas:** Each worker obtains a unique instance identity and a durable membership record tied to a fleet generation. Track expected membership via a trusted deployment controller; do not infer membership solely from currently responding processes.
2. **Close admissions:** Operator STOP acquires the singleton row lock, disables the gate, increments generation and records the stop event. STOP acknowledgment is **ADMISSIONS_CLOSED**, not external drain.
3. **Stop worker starts:** Each registered worker observes the generation, ceases claiming and accepting new work, and records an authenticated STOP acknowledgment for that generation. No stale-generation acknowledgment counts.
4. **Inventory active attempts:** Worker-reported active attempts and durable `IntegrationAdmission` records must agree; any discrepancy or inaccessible ledger is an escalation.
5. **Bounded wait:** Wait for local callbacks with a deadline. On timeout, mark attempts uncertain and quarantine. Never treat an expired lease, lost heartbeat, SIGKILL or network partition as proof that provider work stopped.
6. **Independent provider verification:** If a provider supports a real fence/status lookup, verify it through separately authenticated evidence. Otherwise operator status remains `ADMISSIONS_CLOSED / EXTERNAL_STATUS_UNKNOWN`.
7. **Restart:** Restarted workers must re-register and see the stopped generation before processing. No automatic replay of unresolved attempts.
8. **Reactivation:** Separate authorization and reconciliation gates, with explicit operator sign-off. This phase adds no enable endpoint.

## Assessment contract

Inputs: fleetStopped, stopGeneration, trusted expectedWorkerIds, worker observations (generation, stop acknowledgment, active attempt count, heartbeat timestamp, crashed flag), unresolved admission count, observation freshness window.

Outputs: admissionsClosed, allWorkersAcknowledged, localWorkersIdle, ledgerEmpty, externallyQuiescent **always false**, escalationRequired and reasons.

The deterministic selftest covers: two idle acknowledgments; missing replica; crashed replica; stale heartbeat; stale-generation acknowledgment; active callback; unresolved ledger; database outage; enabled fleet; duplicate or unregistered workers; and empty roster. A locally clean state is never external proof.

## Acceptance gates still open

- Durable trusted worker membership and stop acknowledgments in PostgreSQL, authenticated and protected against forged observations.
- Cross-process integration and SIGKILL tests with actual persisted worker records; the current pure contract test is **not** a multi-process E2E.
- Restart/partition/lease-expiry and provider callback overlap with real or authorized mock transport.
- Provider-side fence or independently verified status evidence before claiming external quiescence.
- Operator procedures for bounded drain, unresolved attempts, and explicit no-replay policy.

**Decision:** Phase 5E.2AD delivers the safety design and regression model only. G1 remains OPEN, production NO-GO; do not merge to main, deploy, or activate real providers.
