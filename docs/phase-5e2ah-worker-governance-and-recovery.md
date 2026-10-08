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
