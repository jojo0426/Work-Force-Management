# Phase 5E.2AI — Payload-Bound Governance, Trusted Identity and Credential Migration

**Status: partial implementation, CI pending. Production NO-GO.**

## Implemented
- Corrected Phase 5E.2AH migration ordering: governance events must be created before single-use approval consumption. The later duplicate event migration was removed; the earlier renamed migration is on the isolated feature branch only.
- Added nullable governance event `payloadDigest` with a hex-digest constraint. Exact ENROLL approvals now include the canonical SHA-256 digest of worker ID, operation and proposed credential fingerprint. RETIRE uses the canonical worker/operation digest. The transactionally consuming mutation service queries only approvals for that exact digest.
- Synthetic signed governance session tests now cover invalid key, expiration and unauthorized role. CI includes a dedicated payload selftest.
- No secrets are written to the governance event; the credential fingerprint and operation digest are one-way hashes.

## Unresolved gates
- **Trusted identity integration:** Existing HMAC session envelopes are a synthetic test boundary, not a real identity provider or authenticated deployment controller. Key custody, role/session revocation and OIDC issuer validation remain unimplemented.
- **Credential migration:** Historical plaintext membership tokens are not migrated or erased. A migration must first classify legacy rows and provide audited rotation with safe rollback; never silently hash a leaked credential and call it remediated.
- **Approval replay:** Approval consumption is unique per event. Governance event uniqueness is currently scoped by worker/operation/actor/action, which limits repeat operations; operation-specific immutable request IDs and signed payload authorization remain needed.
- **Crash recovery:** No real multi-process SIGKILL or network-partition tests, heartbeat freshness or provider-side request-start fence.
- **Safety:** No production integration activation, merge to main, or deployment. G1 remains OPEN.

## Next safe development
Integrate verified identity from a real deployment controller, add immutable request-specific approval IDs, and implement a **dry-run-only** legacy credential inventory/migration report before authorizing any data mutation.
