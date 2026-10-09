# Phase 5E.2AL — Exclusive Trusted-Issuer Governance, Rotation Controls and Crash Recovery

**Status: isolated feature-branch prototype; production NO-GO.**

## Implemented
- Synthetic HMAC governance recording and mutation entrypoints now reject requests unless `GITHUB_ACTIONS=true`, `WFM_SYNTHETIC_GOVERNANCE_FIXTURE=true`, and `DATABASE_URL` points to the isolated `wfm_ci` database. The three legacy synthetic governance PostgreSQL tests explicitly opt in. Outside this test environment the only non-disabled governance entrypoints use pinned RS256 trusted issuer verification.
- Internal trusted issuer paths continue to require independently reviewed, exact request-ID and payload-bound approvals with atomic single-use consumption. No production issuer, key source, or deployment-controller binding exists.
- Added actual subprocess SIGKILL test. The child writes a synthetic durable membership to isolated PostgreSQL, is killed by the parent, and the parent verifies durable membership remains and external quiescence is never inferred. **This is not an external request-in-flight crash, provider-side fencing, network partition, or multi-replica quiescence proof.**
- Existing rotation readiness preflight remains **read-only**, always reports `safeToRotate=false` and `externallyQuiescent=false`. No credential updates, deletions, or rotations are authorized or executed.

## Open acceptance gates
1. Inject pinned issuer configuration exclusively from authenticated deployment configuration and integrate a real operator identity provider, with revocation, key rotation, audit and controller authorization.
2. Eliminate any test-mode environment override possibility in production deployment manifests; enforce fixture access at build/release boundary.
3. Implement request-bound, independently approved rotation with fresh managed secrets and non-reusable old credentials after proven provider-side fencing and worker quiescence.
4. Test process death *during* an externally observable request, multiple independent replicas, delayed callbacks, and network partition.
5. Keep production integrations disabled and preserve historical credential evidence pending separately authorized remediation.

**No merge to main, no deployment, no provider activation. G1 remains OPEN.**
