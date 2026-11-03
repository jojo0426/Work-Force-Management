# CF-01 — Cloudflare deployment readiness (planning-only)

## Verified baseline
- Branch source: wfm-phase-5e-sandbox-acceptance at 8f2126c5bb7d630e2b247d693116a356f7412343.
- Monorepo: web/ Next.js, backend/ NestJS + Prisma, PostgreSQL/PostGIS in docker-compose.yml.
- Existing web/next.config.js rewrites /api/v1/* to http://127.0.0.1:4000; this is not a remotely deployable API destination.
- No Cloudflare build, runtime, authentication, or database migration has been accepted by this audit.

## Deployment constraints
1. Do not deploy the repository root with default Wrangler commands. First establish a compatible Next.js Workers adapter and build artifact; pin dependencies and prove a clean build.
2. Determine NestJS and Prisma/PostGIS runtime compatibility independently. Do not claim a Workers-only backend is supported without executing contract, auth, data, and integration tests. An external backend and PostgreSQL may be required.
3. Never reuse the example docker-compose database password; use managed secrets and isolated synthetic demo data. Confirm migrations and backup/restore.
4. Replace localhost API rewrites with an environment-specific HTTPS endpoint, enforce CORS/CSRF/session security, RBAC, rate limits and Access protection. No live CRM, billing, network activation or subscriber data.
5. Disable preview publication until verified; do not create a public deployment, tokens, database or billable resources without separate authorization.

## Admission gates
- G1: source and dependency compatibility report — OPEN.
- G2: clean web build and Cloudflare local preview — OPEN.
- G3: backend/database connectivity and schema migrations — OPEN.
- G4: synthetic end-to-end login, work-order, exception, supervisor closure and rollback — OPEN.
- G5: security review, cost ceiling, access restriction, owner sign-off — OPEN.

**Status: NO-GO for public or client deployment.** This document changes no runtime code or operational configuration.
