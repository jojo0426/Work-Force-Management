# Phase 5E.2L — Strict Start Safety and Provider Idempotency Foundation

**Status: partial safety contract only; CI pending. Not approved for production.**

Added `inspectStopSafety()`, which distinguishes **admissions closed** from **external quiescence verified**. The latter is deliberately always false until an external provider protocol proves it. A zero unresolved-admission count must not be misrepresented as proof of no in-flight network traffic.

Added `deriveProviderAttemptKey(jobId, claimToken, targetSystem)`, a deterministic SHA-256 correlation identifier, and a fail-closed `ProviderIdempotencyEvidence` acceptance predicate requiring actual sandbox validation, provider idempotency, status lookup, and a positive retention window. This key is not sent to providers yet and no provider supports are assumed. Added mock regression to CI.

**Unresolved critical risk:** A worker can commit `IN_FLIGHT`, pause, then initiate a network request after `stopFleet()` has acknowledged. Database transactions cannot atomically order a network send with the stop acknowledgement. Do not claim strict post-stop request-start safety. An explicit dispatch-start handshake, provider-side fencing/idempotency or a stop protocol that waits for authorized starts to finish is still required.

**Next implementation work:** enforce a documented start barrier/lease with bounded stop/drain and a conservative unknown outcome; integrate the correlation key only with providers proven to honor it; two-process timeout/crash tests, provider reconciliation, operator acceptance. Keep integrations disabled and feature branch unmerged.
