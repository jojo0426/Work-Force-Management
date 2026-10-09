# Phase 5E.2AM — Multi-Replica External Dispatch Fencing, In-Flight Crash Recovery, Production Identity Readiness

**Status: isolated adversarial test phase, NOT a completed external fence. Production NO-GO.**

## Implementation
- Corrected Phase 5E.2AL CI regression: isolated synthetic governance guard contained a malformed regular expression, causing the Phase 5E.2AH governance E2E to fail TypeScript compilation. Replaced with a valid database URL test guard.
- Added a deterministic two-replica adversarial interleaving. Replica A records durable send intent; replica B acknowledges STOP; delayed replica A may still start externally. Provider quiescence remains **unverified**. Simulated SIGKILL after the possible start preserves an **unknown outcome**, never a successful stop.
- Added a real child-process SIGKILL PostgreSQL E2E with a synthetic active-attempt counter. The child persists activeAttempts=1, is killed, and an independent connection verifies that the unresolved attempt remains and stop acknowledgment has not been forged. **No actual external provider request is sent.**
- Both tests run in the backend CI security suite; no provider credentials or production integration endpoints.

## Production identity readiness
The internal pinned RS256 verifier has no real issuer configuration or deployment-controller trust chain. Before cutover: pin a real issuer and audience in protected deployment configuration, secure and rotate signing keys, enforce role revocation and operator sessions, isolate test fixtures at build/release boundary, and validate authenticated controller authorization end-to-end. Do not enable credential rotation or provider dispatch until these controls are proven.

## Critical G1 finding
A local PostgreSQL STOP and durable send intent **cannot guarantee** that a previously authorized worker will not initiate an external request after STOP. This phase deliberately reproduces that counterexample. A real provider-side fencing token or equivalent externally enforced dispatch gate, plus adversarial live-transport validation, is required before production signoff. Neither a database lease nor process SIGKILL alone closes G1.

**No main merge, deployment, provider activation, credential mutation or production signoff.**
