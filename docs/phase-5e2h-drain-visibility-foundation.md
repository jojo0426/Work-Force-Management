# Phase 5E.2H — Drain Visibility Foundation

**Status: PARTIAL; CI pending. Not approved for provider execution.**

Added `inspectDrain()`, a fail-closed, read-only fleet status that distinguishes stopped from drained. It counts unresolved durable admissions (ADMITTED, MAY_HAVE_DISPATCHED, IN_FLIGHT, UNCERTAIN). Missing database/control row or an enabled fleet cannot report drained. The service also offers an internal `markAdmissionReconciled` transition (not exposed via API) and `settleCompletedClaim` after a durable job completion. The worker calls settlement only after successful claim completion. A deterministic mock test covers unresolved, empty, enabled, and unavailable states; CI runs it.

**Important:** `drained=true` is only an *admission-ledger observation*, not proof that network requests have ceased. The current lock-across-network design can lose its lock on DB timeout while a provider call continues. Admission records from older implementations or bypass handlers may be missing. No operator API, approval workflow, or provider reconciliation has been built.

**Remaining work:** durable attempt state transitions with leases and external-idempotency evidence; stop acknowledgment explicitly distinguishes admission closed from verified external drain; independent two-replica crash/timeout E2E; remove lock-across-network and bypass paths; reconcile before replay. No main merge or provider activation.
