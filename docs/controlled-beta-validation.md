# Controlled beta validation — FiberBlaze WFM

Release disposition: **NOT APPROVED**. Production **NO-GO**, gateway G1 **OPEN**.
This checklist records acceptance requirements; unchecked items are not completed work.
Use the exact development commit and linked CI run as evidence. Never infer device,
provider, deployment, or security acceptance from TypeScript/build success.

## Reproducible automated validation

1. Check out `wfm-phase-5e-sandbox-acceptance`; record `git rev-parse HEAD` and a clean `git status --short`.
2. Use Node.js 24 and a disposable PostgreSQL 16 database named `wfm_ci`.
   Never point E2E fixtures at business or production data.
3. Run the complete [baseline workflow](../.github/workflows/baseline.yml).
   It is the authoritative list and order of commands, environment flags, and database setup.
   Backend validation generates Prisma, validates schema, applies checked-in migrations,
   runs operational/security/integration tests, builds, and audits production dependencies.
   Web auth/build/audit and mobile TypeScript must also succeed.
4. Verify every required step executed. A skipped acceptance test is not a pass.
   Preserve the run URL, commit SHA, failing step/logs if any, and dependency audit output.
5. The mobile audit now blocks critical findings. Record high/moderate findings separately and resolve
   release-impacting vulnerabilities before approval; a green CI run does not certify mobile dependencies.

Fast local checks (do not replace full database CI):

```bash
cd backend
npm install --no-fund
npm run prisma:generate
npm run test:security
npm run test:gps-session
npm run test:phase5e-gateway-transport-policy
npm run test:phase5e-synthetic-send-lockout
npm run test:phase5e-external-dispatch-gate
npm run test:phase5e-production-issuer-readiness
npm run build
npm audit --omit=dev --audit-level=high
```

## Required beta evidence

| Acceptance area | Required evidence | Current disposition |
|---|---|---|
| Exact release candidate | All baseline jobs and required steps successful for that SHA | Verify per candidate |
| Dispatch and lifecycle | Excel validation, assignment/reassignment races, technician Start/Finish and field-exception DB E2E | Mandatory CI plus device acceptance |
| Auth and RBAC | Missing/expired tokens, disabled users, wrong roles, cross-team access and approval-session binding | Mandatory security tests |
| GPS live sessions | Expired/disabled/role-changed sockets cannot update or receive management locations; polling and direct upgrades enforce `CORS_ORIGINS` | GPS regression gate with local transport tests; device acceptance pending |
| Geographic records | First-visit subscriber/NAP verification, verified-record reuse, changed-address discrepancy and transfer old/new-address navigation | Device and operator acceptance pending |
| Evidence | Camera-only capture, private upload, expired tickets, completion evidence, speed-test capture, retry without duplicate submission | Device/storage acceptance pending |
| Reports and KPIs | Daily/weekly/monthly totals, team/technician summaries, Excel export and print layout compared to seeded jobs | Operator acceptance pending |
| Offline/mobile | Network loss during Start/upload/Finish, reconnect, app restart, stale assignment removal, denied permissions and logout | Physical-device evidence required |
| Dependencies | Backend/web blocking audits and explicit mobile vulnerability disposition | SDK 57 migration implemented; high/moderate findings and device acceptance remain open |
| Migration and recovery | Clean database migration and upgrade of a restored previous snapshot; measured backup restore | Environment acceptance pending |
| External gateway | Non-bypassable egress, authenticated caller provenance, protected destination registry and credentials, provider fencing/idempotency | G1 OPEN; real providers disabled |
| Gateway failure recovery | Database races, actual callback-entry SIGKILL, durable UNKNOWN, replay/rearm denial | Synthetic CI coverage only |
| Operations | HTTPS, allowlisted origins, private evidence storage, monitoring receipt, owners, retention and rollback drill | Environment acceptance pending |

For each manual case record tester, device/environment, exact SHA, input, expected
and observed result, timestamp, and a privacy-safe evidence reference. Do not include
subscriber personal details or credentials in public GitHub logs or screenshots.

## Migration and rollback plan

- Rehearse on an isolated restored database and preserve backup/restore evidence.
- Use `prisma migrate deploy` for release migrations; never `migrate dev` against production.
- Record applied migration IDs and the prior application/image/configuration versions.
- Stop admissions and review unresolved integration attempts before rollback. UNKNOWN
  outcomes require independent reconciliation; never erase or replay them to unblock restart.
- Prefer application/configuration rollback when schema compatibility permits. A schema
  reversal or restore needs a reviewed migration-specific plan and approval if destructive.
- Prove restore in isolation and measure recovery time before production authorization.

## Release boundaries and remaining work

No main merge, production deployment, real provider activation, credential rotation,
or destructive production database operation is authorized by this checklist.
Continue safe implementation and automated validation on the development branch.
Prepare concrete environment/device evidence and a reviewed candidate for approval.
Until critical security and gateway acceptance is established, retain production NO-GO.

Gateway details: [Phase 5E.2AP](phase-5e2ap-synthetic-send-gateway.md),
[Phase 5E.2AQ](phase-5e2aq-gateway-trust-boundary.md).
Operational foundation: [activation/recovery runbook](phase-5d4-activation-recovery-runbook.md).
