# WFM v1.0 Production Readiness Runbook

This runbook is the release gate for the FiberBlaze WFM production environment. Never store real production credentials in this repository.

## 1. Required production configuration

Set `NODE_ENV=production` and provide all secrets through the deployment platform secret store or protected environment variables.

Required backend values:
- `DATABASE_URL` — production PostgreSQL connection string. Use TLS/SSL as required by the database provider.
- `JWT_SECRET` — unique cryptographically random secret, at least 32 characters. Never reuse development values.
- `CORS_ORIGINS` — comma-separated HTTPS origins for the production management web application. Production startup intentionally fails when this is missing.
- `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` — production evidence/object-storage credentials. Set `S3_ENDPOINT` only when using a compatible non-AWS endpoint.
- `PORT` — API listener port supplied by the deployment platform when applicable.

Bootstrap administrator values are temporary. Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and optionally `BOOTSTRAP_ADMIN_NAME` only for initial provisioning. Remove/clear the bootstrap password immediately after the administrator account is created.

## 2. Network and HTTPS

- Terminate public traffic with HTTPS/TLS. Do not expose the production API over plain public HTTP.
- Configure `CORS_ORIGINS` to the exact trusted HTTPS management origins; do not use `*` with credentialed requests.
- Keep PostgreSQL and object-storage credentials inaccessible to browser/mobile clients.
- Restrict database network access to the application/deployment network where the hosting provider supports it.

## 3. Database release procedure

Before deployment:
1. Confirm the target backup completed successfully and is restorable.
2. Record the release commit SHA and current database migration state.
3. Run `npm ci` in `backend/`.
4. Run `npx prisma validate` and `npx prisma generate`.
5. Run `npm run prisma:migrate:deploy` against the production database. Never run `prisma migrate dev` in production.
6. Run the production backend build.
7. Start the new application revision only after migration deployment succeeds.

Do not manually edit Prisma migration history in production.

## 4. Evidence/object storage

- Use a private bucket/container. Evidence must not be globally public.
- Use the application's short-lived upload/verification flow rather than exposing permanent write credentials.
- Configure provider-side encryption and lifecycle/retention policy appropriate to company requirements.
- Enable object versioning when supported if operational policy requires recovery from accidental replacement/deletion.
- Validate upload, verification, replacement audit history, and evidence retrieval during release smoke testing.

## 5. Backups and restore verification

Production is not ready merely because backups are enabled. A restore must be tested.

Minimum release requirements:
- Automated PostgreSQL backups with documented retention.
- A periodic restore test into an isolated database.
- Evidence/object-storage retention/versioning policy documented with the storage provider.
- Record the most recent successful restore-test date before a production release.

## 6. Logging and monitoring

- Capture application stdout/stderr in the hosting platform's centralized logs.
- Do not log JWT secrets, database credentials, object-storage secrets, passwords, or full Authorization headers.
- Monitor API availability, application restarts, database connectivity, migration failures, and storage errors.
- Treat Live Operations attention signals as advisory; management remains responsible for operational action.

## 7. Release smoke test

After deployment verify:
1. API starts successfully and rejects untrusted browser origins.
2. Authorized management login works; unauthorized roles remain blocked from management endpoints.
3. Create/import a controlled test WO and assign it.
4. Technician receives authoritative state, starts the WO, and reports location.
5. Camera evidence upload and verification succeeds.
6. Field-exception review works when exercised.
7. Finish Gate completes exactly once and returns technician to AVAILABLE.
8. Live Operations reflects the state transition.
9. Daily reporting and Excel export contain the test activity.
10. Audit trail records the controlled workflow.

Remove or clearly mark test data according to operational policy.

## 8. Rollback procedure

Application rollback and database rollback are separate decisions.

- Keep the previously validated application image/revision and release SHA available.
- If the new application fails before any incompatible database change, route traffic back to the previous validated application revision.
- Prisma migrations are forward-oriented. Do not improvise destructive SQL rollback in an incident.
- If a schema/data migration causes a production-impacting failure that cannot be safely corrected forward, stop writes, preserve logs, and restore the verified pre-release database backup into the approved recovery target according to the hosting provider procedure.
- Re-run the release smoke test after recovery before reopening normal operations.

## 9. Final release record

For every production release record:
- Git commit SHA/tag
- successful WFM Baseline Validation run number
- migration deployment result
- database backup identifier/time
- most recent restore-test date
- deployment time and operator
- smoke-test result
- rollback revision/reference

A release is not considered complete until these items are recorded and the production smoke test passes.
