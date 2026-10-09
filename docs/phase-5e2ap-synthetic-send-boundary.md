# Phase 5E.2AP — Dedicated Synthetic Send Boundary and Crash-Safe Dispatch Contract

**Status: isolated synthetic PostgreSQL proof; production NO-GO; G1 OPEN.**

## Implemented
- Added `IntegrationSyntheticSendGatewayService`, an isolated CI-only dispatch boundary requiring `GITHUB_ACTIONS=true`, `WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE=true`, and the `wfm_ci` PostgreSQL database. No provider network I/O or credentials.
- The gateway requires a pre-existing durable request reservation and marks it `UNKNOWN` **before** entering the send boundary. It then acquires the shared GLOBAL PostgreSQL `FOR UPDATE` lock and verifies STOP/generation again. The synthetic callback runs under that lock, so STOP cannot commit during a normally completing callback.
- The synthetic PostgreSQL E2E uses independent connections to demonstrate STOP waits for the in-progress callback, stale pre-STOP work is rejected after STOP, duplicate execution is rejected, and external outcomes remain UNKNOWN. This is not a live provider test.
- CI registers the new test alongside the earlier shared durable admission and SIGKILL tests.

## Explicit limitations
1. This prototype does not own real provider credentials, restrict worker egress, enforce provider-side fencing, or provide a network gateway.
2. Holding a database transaction open across network I/O is **not** an acceptable production transport design. A crash releases the row lock even if an external request has already escaped and remains in flight. This means STOP may acknowledge admissions closed without proving external quiescence.
3. Synthetic callbacks must not spawn detached work. This restriction is not technically enforced outside the fixture.
4. No real transport fault injection, provider receipt reconciliation, gateway network partition, real issuer integration, or privileged operator cutover.
5. The fixture gates are runtime environment checks, not an independently attested production build boundary.

## Next acceptance requirements
- Design a dedicated gateway process or provider-native fencing endpoint as the sole provider credential and network-egress holder.
- Implement a durable, provider-enforced request-start token/generation and STOP/drain acknowledgment with explicit UNKNOWN handling and external receipts.
- Adversarially test delayed sends, two actual gateway processes, SIGKILL after network send, gateway restart, partitions and lost provider responses.
- Complete real privileged identity provider, key custody, revocation and independent authorization integration before enabling any production path.

**No main merge, deployment, provider activation, credential rotation or production signoff.**
