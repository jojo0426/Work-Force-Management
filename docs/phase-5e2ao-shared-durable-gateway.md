# Phase 5E.2AO — Shared Durable Gateway, Cross-Replica STOP and Crash Recovery

**Status: sandbox PostgreSQL admission serialization. G1 OPEN. Production NO-GO.**

## Implemented
- Added `IntegrationSharedGatewayControl` (GLOBAL, stopped by default, monotonic generation) and `IntegrationSharedGatewayAttempt` (durable request-ID reservations with RESERVED / UNKNOWN / SETTLED states). PostgreSQL migration adds status, request-ID and generation constraints.
- Added `IntegrationSharedGatewayService`: reserve and STOP serialize on the same PostgreSQL `FOR UPDATE` row across independent connections; duplicate IDs and stale generations are rejected. STOP closes future reservations and reports unresolved attempts; **externallyQuiescent is always false**.
- Fixture-only rearm requires explicit isolated CI flags, a new generation, and zero unresolved attempts. There is no public rearm API. Crash recovery may mark a RESERVED attempt UNKNOWN, never silently SETTLED.
- Added PostgreSQL two-client race E2E and a real child-process SIGKILL test: reservations survive worker death; STOP preserves unknown outcomes and blocks rearm.
- CI runs both tests against isolated `wfm_ci` PostgreSQL.

## Crucial boundary
**This is a shared durable admission gate, not an externally enforced send gateway.** A worker can reserve before STOP, be paused, then send after STOP unless the actual provider/network gateway enforces the generation at request-start time. The new service deliberately does not accept a send callback, hold provider credentials, or issue outbound requests. It does not close G1.

## Further acceptance gates
1. Build a dedicated single enforcement service or use provider-native epoch fencing; deny all direct worker egress/credentials to providers.
2. Ensure the gateway serializes real socket send initiation with STOP and persists request outcome/idempotency; test paused sender, partition, process death, restart and provider response loss.
3. Establish independent external completion evidence and a provider-specific STOP/quiescence contract; never infer quiescence from database reservation counts alone.
4. Integrate real privileged issuer, revocation, secure key custody, and independent operator authorization.
5. Separately authorize and audit credential remediation after external fencing proof.

No merge to main, deployment, real provider activation, or credential rotation.
