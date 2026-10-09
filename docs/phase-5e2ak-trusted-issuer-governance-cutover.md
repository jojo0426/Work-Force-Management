# Phase 5E.2AK — Trusted Issuer Integration, Governance Cutover, Credential Rotation Readiness

**Status: partial implementation. Production NO-GO.**

## Implementation
- Added `recordTrustedIssuer` and `applyTrustedIssuer` to internal governance and roster mutation services. Both use the pinned RS256 verifier and require a mandatory request ID. The existing PostgreSQL immutable two-actor proposal/approval, payload digest, fleet stop check and single-use approval consumption are reused.
- Added isolated PostgreSQL E2E with synthetic locally generated RSA key pair, distinct proposer/reviewer tokens, invalid-role, wrong-request, changed-credential and replay rejection.
- Added read-only `IntegrationCredentialRotationReadinessService.inspect()` that combines stopped-fleet state, unresolved admission counts, active attempt totals and aggregate legacy credential inventory. It always reports `safeToRotate:false` and `externallyQuiescent:false`. It never changes secrets or membership rows.
- Repaired Phase 5E.2AJ PostgreSQL regression: enrollment and retirement must have different request IDs after request-scoped uniqueness.

## Unresolved production cutover
- The trusted-issuer methods are **internal prototypes**, not wired into live HTTP controllers, a real identity provider, a deployment controller or a managed secret store.
- Existing synthetic HMAC `recordAuthenticated` and `applyAuthenticated` methods remain callable by internal code. A production cutover must disable them or restrict them to isolated test fixtures before claiming an exclusive trusted-issuer path.
- No production issuer JWKS, key rotation, revocation, workload authentication or privileged controller authorization. The pinned verifier does not establish key provenance by itself.
- Historical plaintext credentials are **not** rotated, removed or migrated. The readiness service is advisory only.
- Multi-replica external request-start fencing, real SIGKILL/partition validation, distributed quiescence and release signoff remain outstanding.

**Safety:** no merge to main, no deployment, no provider activation. G1 BLOCKER remains open. Production NO-GO.
