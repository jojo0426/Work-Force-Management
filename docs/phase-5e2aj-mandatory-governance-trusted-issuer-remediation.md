# Phase 5E.2AJ — Mandatory Request Governance, Trusted Issuer and Credential Remediation

**Status: implementation prototype; production NO-GO.**

## Implemented
- Governance proposals, approvals and roster mutations **require** a 16–100 character request ID; omitted or malformed request IDs fail closed. PostgreSQL uniqueness now scopes actor actions to a request, allowing later independent requests without reusing the same approval.
- Approval remains bound to the exact worker, operation, credential fingerprint and request ID; immutable approval consumption remains atomic with mutation.
- Added a **standalone, offline pinned-key RS256 JWT verification prototype**. It verifies signature with an explicitly supplied trusted public key, issuer, audience, key ID, role, session ID, issue/not-before/expiration times, and rejects untrusted header key URLs. Negative security selftests cover forged claims and invalid signatures.
- Updated isolated PostgreSQL tests to use mandatory request IDs.

## Trust and deployment boundary
The verifier is **not wired into** `IntegrationWorkerGovernanceService` or `IntegrationGovernedWorkerMutationService`, which still use synthetic HMAC sessions. There is no configured real issuer, JWKS refresh, workload identity binding, role revocation, key custody or production operator authentication. The verifier must not be represented as completed trusted identity integration.

## Legacy credential remediation plan — read-only until explicit approval
1. Run the aggregate-only credential inventory in an isolated environment, classify unmatched memberships as requiring investigation (not necessarily proven plaintext), and record counts without worker identifiers or secrets.
2. Define a secure, privileged remediation runbook: validate fleet STOP, reconcile all uncertain admissions, confirm every worker quiesced, collect approved operator identities and independent request-specific authorization.
3. Generate **new independent high-entropy worker secrets** in a managed secret store. Do not rehash or preserve a suspected exposed plaintext token as the new secret.
4. Stage rolling credential rotation only after provider-side fencing and stop/restart safety have been proven. Ensure stale workers cannot resume with old credentials, and test rollback without restoring compromised secrets.
5. Validate worker identities and durable audit evidence across replicas; only then remove historical plaintext credential material via an explicitly authorized, separately reviewed migration.
6. Do not modify or delete any credential records as part of this phase. Do not merge to main, deploy, or activate real providers.

## Outstanding blockers
- Real trusted issuer wiring and secret management; request-bound identity and revocation across replicas.
- Historical credential remediation execution, with authorization and rollback evidence.
- Real process SIGKILL/network partition recovery and provider-enforced request-start fencing.
- Independent production operator signoff. **G1 OPEN / production NO-GO.**
