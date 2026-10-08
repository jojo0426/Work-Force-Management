# Phase 5E.2AF — Trusted Worker Identity, Membership Integrity, and Restart Recovery

**Status:** Prototype code, migration and isolated PostgreSQL tests. **No production worker wiring or provider activation.**

## Implemented

- `IntegrationExpectedWorker` is a database-backed expected worker roster with credential SHA-256 fingerprint, approving controller identifier and retirement timestamp. New enrollment is an internal service method, not a public route.
- `IntegrationTrustedWorkerService` verifies approved non-retired worker credentials with constant-time digest comparison, and stores only a fingerprint in new `IntegrationWorkerMembership.instanceToken` records.
- Registration and generation-bound stop acknowledgment serialize with the fleet singleton row lock. Duplicate registration and unapproved takeover are rejected. A restart cannot silently replace an existing worker identity.
- Inspection derives expected workers from the persisted roster rather than a caller-selected subset; missing workers prevent `allAcknowledged`. It never claims external quiescence.
- Isolated PostgreSQL E2E checks forged identities, wrong credentials, no plaintext credential storage in new membership, stale/forged/duplicate acknowledgments, missing roster member, and restart takeover denial.

## Unresolved security and recovery work

- This is **not** production workload identity. The enrollment caller is not authenticated by a deployment controller, SHA-256 fingerprints of caller-provided secrets require high-entropy credentials, no secret-manager custody/rotation is provided, and the previous 5E.2AE prototype still stores raw `instanceToken` in its legacy registration path. That legacy path must be retired/migrated before deployment.
- Existing worker credentials and roster are not protected by an immutable approval audit or database-level policy. Retirement/replacement needs a separately approved transaction, reconciliation of unresolved attempts, and proof of worker termination; it is intentionally not implemented.
- `inspect()` does not yet validate heartbeat freshness, detect extra active workers not in roster, or independently verify provider status. No trusted process/transport attestation, live heartbeat, process SIGKILL E2E, or secure identity rotation.
- This phase must not be used to claim a safe restart, provider drain, or production-grade authentication. No real integration can be activated on its basis.

## Remaining gate

G1 remains **OPEN / production NO-GO**. Next phase should enforce trusted roster lifecycle and revocation, heartbeat freshness, legacy plaintext token migration, and multi-process crash/restart recovery tests before any runtime wiring.
