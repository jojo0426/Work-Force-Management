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

## Continuation: request correlation and read-only credential assessment

- Added optional `requestId` correlation to immutable governance events and transactionally checked the same ID when consuming approval. New isolated PostgreSQL E2E proves that approval for request A cannot authorize request B or a changed credential, and that an approved request cannot be consumed twice.
- Added `IntegrationLegacyCredentialInventoryService.assess()`, an **aggregate-only, read-only** report of member count, matching approved credential fingerprints, unmatched/legacy records and unapproved memberships. No worker identifiers or token material are returned. It does not authorize or perform migration, revocation, deletion or quiescence claims.
- A request ID is currently optional for compatibility with earlier synthetic test flows. **This is not a complete production request-specific governance guarantee.** The old per-actor unique index also prevents multiple independent requests of the same operation from being approved by the same actor; a request-scoped unique key and mandatory request IDs must replace it after migrating old tests.
- **Trusted identity-provider integration remains unimplemented.** The current signed HMAC test envelope is not OIDC, workload identity or a real deployment-controller session. No trusted issuer/JWKS verification, key rotation or revocation.
- No historical plaintext credential migration was performed. Classifying an unmatched record does not prove it contains plaintext; treat the report as risk triage, not a definitive secret-exposure determination.
- Production G1 remains OPEN / NO-GO. Do not merge, deploy or activate providers.
