# Phase 5E.2O — Bounded Drain Polling and Reconciliation Audit Design

**Status: partial implementation, CI pending; no provider approval.**

Added `IntegrationShutdownDrainService.stopAndWaitForLedger()` with a maximum 300-second deadline, polling interval limits, injected test clock/sleep, and explicit `timedOut` and `polls` results. It stops admissions once, then repeatedly reads the durable ledger. If attempts remain at the deadline, it escalates. If the ledger is unavailable, it fails closed. An empty ledger is not external network quiescence; `externallyDrained` always remains false.

Added deterministic regression for timeout and ledger settlement. This is an internal service method, not a public endpoint.

## Reconciliation audit requirements (not yet implemented)

1. Require authenticated operator role and two-person approval for ambiguous external effects.
2. Capture provider request identifier, verified outcome, evidence reference, reviewer, and immutable timestamp.
3. Reconcile only when provider status lookup/idempotency retention has been validated in sandbox.
4. Never auto-retry an `UNCERTAIN` or `IN_FLIGHT` attempt without verified provider outcome.
5. Record every approval and resolution in durable append-only audit data; refuse missing evidence.
6. Treat deadline expiry as escalation, not proof that a provider request has been cancelled.

**Remaining critical risks:** Post-stop authorized requests may still start; generic handler fencing, provider network fault injection, external cancellation and independently verified drain remain incomplete. No merge to main and no real provider activation.
