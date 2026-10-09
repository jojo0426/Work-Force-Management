# Phase 5E.2AQ — Dedicated Gateway Trust Boundary and Provider Transport Readiness

**Status: isolated design and policy tests. Production NO-GO; G1 OPEN.**

## Implemented
- Added `integration-gateway-transport-policy.ts`: a pure, fail-closed request policy for an eventual dedicated gateway. Requests carry requestId, bigint fencing generation, a logical destination ID, payload SHA256 digest, and a caller fingerprint.
- The policy rejects STOP, stale generations, malformed requests, unknown destination IDs, and untrusted caller fingerprints. The caller fingerprint comparison is constant-time for well-formed hex digests. Destination IDs are NOT worker-supplied URLs.
- Added negative tests for each rejection and a compile-time disabled live provider egress constant. CI runs the tests.
- Existing Phase 5E.2AP synthetic PostgreSQL send boundary and unknown-outcome handling remain intact.

## Not yet established
- A fingerprint string in a request is **not authenticated identity**. A production gateway must obtain caller identity from verified mTLS peer certificates or independently validated signed service tokens, not from caller assertions.
- This policy is not wired to an HTTP server, network isolation, provider credential custody, a live destination registry, or a real provider endpoint.
- The policy is a preflight, **not** a race-safe request-start fence. A shared durable gateway or provider-native epoch enforcement must perform the final atomic decision at the actual outbound send boundary.
- A crashed process may release a PostgreSQL lock while a previously transmitted request remains in flight. STOP must never claim provider quiescence without independent external evidence.
- No real issuer, revocation, rotation, transport fault injection, provider receipt reconciliation, or production signoff.

## Next acceptance gates
1. Establish gateway-only provider credentials and egress, with workers technically unable to bypass it.
2. Verify caller identities cryptographically at the gateway boundary and pin destinations in protected deployment configuration.
3. Implement provider-enforced generation fencing or a single authoritative network send boundary with durable idempotency, crash-safe STOP and unknown-outcome reconciliation.
4. Adversarially test gateway restart, partitions, delayed requests and SIGKILL after external send, then independently review the evidence.

No main merge, deployment, real provider activation or credential rotation.
