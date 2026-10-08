# Phase 5E.2M — Dispatch-Start Barrier and Controlled Shutdown Protocol

**Status: partial implementation, CI pending. Not production-safe.**

The fleet control service exposes `authorizeDispatchStart()`, a short-transaction barrier that verifies the singleton fleet is enabled and the owned claim/generation still match before persisting `IN_FLIGHT`. The executor invokes this barrier before its callback, without a long-lived database transaction.

`stopAndInspect(actor, reasonCode)` closes admissions through `stopFleet()`, then returns the generation, unresolved admission count and `externallyDrained: false`. It never represents a stopped gate or empty ledger as verified network quiescence.

The isolated PostgreSQL test checks controlled stop reporting and that a previously prepared marker cannot be newly authorized after stop.

**Critical remaining race:** An attempt authorized just before stop can pause before its network call and start after stop acknowledges. Therefore this barrier does **not** provide strict no-post-stop-network-start guarantees. The ledger records the attempt as unresolved, which supports reconciliation, but is not equivalent to preventing the request.

**Remaining:** explicit dispatch-start handshake or a stop/drain protocol with a bounded wait and operator escalation, complete provider idempotency/status lookup contracts, timeout/crash simulations with provider-like side effects, and full worker handler fencing. No real provider activation or merge to main.
