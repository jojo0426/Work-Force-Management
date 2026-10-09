# Phase 5E.2AN — External Dispatch Gateway Contract and Production Identity Readiness

**Status: sandbox reference only. G1 OPEN; production NO-GO.**

## Implemented
- Defined `ExternalDispatchGate` contract with request ID, fencing generation, callback admission, STOP/drain, and inspection.
- Built `SandboxExternalDispatchGate` that rejects stale generations, duplicate requests, and delayed sends after local STOP; STOP waits for in-process admitted callbacks to settle.
- Added negative two-instance test showing that **replica B STOP does not prevent replica A from sending** when gate state is local. The in-memory reference does not implement cross-process fencing and is not wired to any provider.
- Added `inspectProductionIssuerConfig` preflight to reject obviously malformed pinned issuer settings while always returning `productionReady:false` until live controller identity binding, revocation, and key rotation are established.
- Added CI tests for local gate, cross-replica counterexample, and issuer configuration.

## Required external STOP contract
1. All outbound provider requests must traverse a **single externally enforced** gateway or a provider-side fencing endpoint. Workers must have no direct provider credentials or network route that bypasses it.
2. The gate must serialize START admission and STOP across replicas, enforce strictly monotonic epochs and request-level idempotency, and persist state durably.
3. STOP acknowledgment must be defined precisely: admission closure alone is not provider quiescence. Confirm admitted requests have drained and reconcile unknown outcomes with the provider; crash/partition scenarios must not falsely acknowledge quiescence.
4. Validate with two independent processes, delayed callbacks, SIGKILL at the external send boundary, partitions, gateway restart and provider response loss.
5. Configure a real identity issuer with protected key provenance, role revocation, deployment-controller authentication and auditable request-bound approvals.

## Limits
The sandbox callback gate does not ensure a callback cannot spawn detached work after returning. The gate is local memory and is not a network security boundary. No live provider is integrated, no credential migration or rotation was performed, and no real identity provider is configured. **Do not treat local STOP/drain as a production external fence.**

No merge to main, deployment, provider activation, or production signoff.
