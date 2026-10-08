# Phase 5E.2AG — Worker Credential Hardening, Trusted Roster Lifecycle and Crash-Recovery Validation

**Scope:** Prototype hardening, legacy API lockout, stopped-fleet retirement guard and isolated PostgreSQL concurrency tests. No live worker integration, public credential endpoints or real provider activation.

## Implemented

1. Disabled legacy `IntegrationWorkerMembershipService.register` and `acknowledgeStop` entrypoints. Both return false without writing plaintext tokens. The legacy inspector remains read-only and conservative. Previously stored legacy tokens are **not** automatically erased or migrated.
2. Added `IntegrationTrustedWorkerService.retire`: locks the fleet singleton, requires STOP and zero unresolved global admissions, rejects non-idle membership, and sets `IntegrationExpectedWorker.retiredAt` without deleting history. Duplicate retirement is rejected. This is an internal prototype method, **not** a complete independently approved lifecycle.
3. Updated prior membership E2E to verify the legacy registration/ack paths are disabled. Added new isolated two-Prisma-connection worker restart E2E covering concurrent single-winner registration, hashed credentials, forgery rejection, stop generation checks, persisted acknowledgments and inability to seize identity after a simulated restart.
4. Extended trusted worker database regression to check retirement fail-closed against outstanding admissions, revocation on successful retirement and conservative external-quiescence reporting.

## Security and correctness limitations

- The `IntegrationExpectedWorker` enrollment method is not bound to a real authenticated deployment controller or independent approval workflow. SHA-256 fingerprints are only appropriate for sufficiently high-entropy random workload secrets; secret-manager storage and rotation are missing.
- The legacy `instanceToken` database column remains for migration compatibility; legacy rows may contain plaintext secrets. Disabling entrypoints does not remediate historical exposure.
- The retirement method's `approvedBy` argument is not session-authenticated or durably audited. It is an internal control-plane prototype and must **not** be exposed to callers or used for production revocation.
- No real SIGKILL test or deployment-controller identity proof is implemented; the two-client E2E models process restart and concurrency but does not prove process isolation or network partition recovery.
- The inspector still lacks heartbeat freshness and detection of unknown live replicas. No provider-side fence or independently verified external quiescence.
- Local shutdown remains **ADMISSIONS_CLOSED / EXTERNAL_STATUS_UNKNOWN**. Never auto-retry uncertain provider operations.

## Follow-up gates

1. Authenticated controller-signed enrollment and independently approved immutable roster audit.
2. Secret manager issuance/rotation and migration/removal of legacy plaintext tokens.
3. Trusted complete roster, generation-bound fresh heartbeats and orphaned-worker detection.
4. Real multi-process SIGKILL/restart and network-partition PostgreSQL E2E.
5. Independently verified provider quiescence before any stronger STOP claim.

**Decision:** G1 remains OPEN / production NO-GO. No merge to main or provider activation authorized.
