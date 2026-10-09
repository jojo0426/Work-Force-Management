# Phase 5E.2AH — Authenticated Worker Roster Governance, Credential Migration and Process-Crash Validation

**Delivered subset:** Append-only worker governance ledger and isolated PostgreSQL adversarial test. **Not completed:** actual authenticated controller integration, credential migration, real process SIGKILL tests. Production remains NO-GO.

## Implemented

- New `IntegrationWorkerGovernanceEvent` PostgreSQL model and migration with immutable update/delete trigger, operation `ENROLL|RETIRE|ROTATE`, action `PROPOSE|APPROVE`, actor identity, session hash and timestamp.
- Internal `IntegrationWorkerGovernanceService` requires caller-asserted privileged actor and SHA-256-shaped session hash, a disabled fleet, proposal before approval, and distinct approver identity/session. Concurrent identical approval races are constrained by a database unique key.
- Isolated two-connection PostgreSQL E2E verifies denial before proposal, unprivileged denial, same actor/session denial, single winning concurrent approval, persistence and database-enforced audit immutability.
- Existing untrusted legacy membership entrypoints remain disabled. No new public routes, provider calls or runtime worker wiring.

## Explicit remaining blockers

1. **Authenticated governance:** Current `VerifiedGovernanceActor` is an internal caller-supplied object; there is no real JWT/workload attestation binding. Governance events are **not yet enforced** by `IntegrationTrustedWorkerService.enroll/retire/register`. Therefore the ledger is evidence foundation, not an authorization gate.
2. **Credential migration:** Legacy plaintext `instanceToken` rows may still exist. No audited migration, zeroization, secret manager rotation or rollout plan is implemented.
3. **Crash recovery:** Existing tests use separate Prisma clients to simulate restart. No real SIGKILL, orphan detection, heartbeat freshness or network partition validation is implemented.
4. **Governance integrity:** Need deployment-controller authority, active role checks, operation-specific proposal IDs and consumed approvals, plus transactionally binding approvals to roster mutations to prevent replay.
5. **Shutdown:** Fleet STOP means admissions closed, not externally quiescent. No provider-side request-start fence.

## Acceptance decision

**Phase 5E.2AH partial / G1 OPEN / production NO-GO.** Do not claim that authenticated governance, credential migration or real crash validation is finished. Do not merge, deploy or activate providers.

## Continuation: transactional governed roster mutation (prototype)

Added `IntegrationGovernedWorkerMutationService.apply` with stopped-fleet row locking and an operation-specific independent PROPOSE/APPROVE pair in the **same database transaction** as worker ENROLL or RETIRE. The reviewer identity must match the requested executor; ENROLL refuses existing IDs, RETIRE checks unresolved admissions and active attempts. The isolated two-connection PostgreSQL regression checks missing approval, proposal-only denial, wrong reviewer, single-winner enrollment concurrency, operation separation and retirement replay prevention.

**Critical limitation:** The older `IntegrationTrustedWorkerService.enroll` and `retire` methods are **still callable** and bypass this new governance service. This is an additional gated prototype, not complete enforcement across every roster mutation path. Also the governance actors are still caller-asserted rather than verified sessions, approvals are not consumed per operation instance, and no real crash test or credential migration has been performed. The production gate remains NO-GO.


## Continuation: legacy lockout and single-use signed governance (prototype)

- Legacy `IntegrationTrustedWorkerService.enroll/retire` and caller-asserted `IntegrationGovernedWorkerMutationService.apply` now fail closed. The earlier `IntegrationWorkerMembershipService` legacy registration/ack remains disabled.
- Caller-asserted `IntegrationWorkerGovernanceService.record` now fails closed. `recordAuthenticated` verifies a signed, time-limited HMAC session envelope with fixed role and audience; `applyAuthenticated` requires the same verified reviewer identity. CI signs synthetic fixtures; **this is not integration with a production identity provider**.
- A new immutable `IntegrationWorkerGovernanceConsumption` table enforces unique approval-event consumption within the same transaction as ENROLL/RETIRE. A rejected mutation rolls back consumption. PostgreSQL concurrency and role/session checks are covered by existing and updated E2E suites.
- The old direct `IntegrationTrustedWorkerService` enrollment/retirement tests now use isolated fixture rows instead of invoking blocked mutation paths.

**Still not production-ready:** signing keys are supplied to internal methods, not sourced from managed KMS or a trusted issuer; the signed session format is a prototype, not standard OIDC; governance events are not tied to per-request operation IDs or payload digests, so approvals for an operation type could authorize a different payload (including a different credential for ENROLL) before consumption. Historic plaintext token migration, real SIGKILL/restart tests, provider-side fencing and authenticated controller integration remain open. Production NO-GO.
