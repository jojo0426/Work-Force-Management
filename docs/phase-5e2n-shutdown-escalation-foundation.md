# Phase 5E.2N — Controlled Shutdown Assessment and Reconciliation Escalation

**Status: limited implementation, CI pending. Not operational acceptance.**

The isolated PostgreSQL regression was repaired to accept the current durable `IN_FLIGHT` state (rather than assuming all records remain `MAY_HAVE_DISPATCHED`).

Added `IntegrationShutdownDrainService.stopAndAssess()`, a single-shot fail-closed operator assessment after `stopAndInspect()`. It distinguishes stop failure, unavailable ledger, unresolved attempts requiring escalation, and an empty ledger. Every outcome explicitly reports `externallyDrained: false`.

Added mock regression tests and a CI step for these cases.

**Boundaries:** This is NOT a timed polling/drain waiter; there is no actual deadline enforcement, provider cancellation, reconciliation API, authorization/audit workflow, or verified external quiescence. It does not eliminate the authorized-before-stop/start-after-stop race. It does not change production activation defaults.

**Next:** introduce bounded polling with explicit deadline and operator notification; enforce authenticated, audited reconciliation backed by provider evidence; add provider-like timeout and duplicate-suppression tests. No merge to main or real provider activation.
