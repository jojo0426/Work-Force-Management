# Phase 5E.2AP — Synthetic External Send Boundary and Crash-Safe Dispatch Contract

**Status: isolated CI-only prototype. G1 OPEN. Production NO-GO.**

## Implemented
- Added `IntegrationSyntheticSendGatewayService.dispatch(requestId,generation,syntheticSend)` as an internal dedicated send-boundary prototype. It requires explicit GitHub Actions CI, `WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE=true` and isolated `wfm_ci` database. No real provider transport, credentials, controller or public route.
- A durable `UNKNOWN` marker is committed **before** a callback could begin. Then the callback runs under the shared PostgreSQL GLOBAL row lock, which serializes synthetic send initiation/completion with `IntegrationSharedGatewayService.stop()`. Delayed callbacks are denied after STOP and repeated attempts cannot be re-sent.
- Added two-client PostgreSQL E2E: STOP waits for a held synthetic callback, delayed reserved work is rejected, and outcomes remain UNKNOWN. Added a negative fixture lockout selftest.
- Adjusted shared gateway race test to use a relative generation so the CI sequence remains isolated.

## Limits and safety
- **This is not a deployed external gateway or a provider-native fence.** The callback is a synthetic in-process function. It must never be used for real outbound I/O: holding a database transaction over a network request is fragile, timeout-prone, and cannot establish provider quiescence after process death.
- A worker crash releases the PostgreSQL lock, but a request might have reached an external provider. The durable UNKNOWN marker prevents claiming completion, not provider-side execution. The callback may detach work outside the transaction; there is no OS/network egress boundary here.
- The implementation is not wired to existing live integration worker dispatch. Existing workers could bypass this prototype. A dedicated gateway process with exclusive provider credentials and enforced network routing, plus an external request-start and STOP contract, remains required.
- Real provider credentials, key management, production issuer, provider-side idempotency and independently verified request outcomes remain unavailable.
- No production provider activation, credential rotation, deployment, or merge to main.

## Next acceptance phase
**Phase 5E.2AQ — Gateway Process Isolation, Non-Bypassable Provider Egress, and Crash/Partition Fault Harness.** Build an isolated synthetic gateway service with explicit network policy evidence and test provider response loss, SIGKILL at send start, gateway restart, and partition. G1 remains open until actual external enforcement is verified.
