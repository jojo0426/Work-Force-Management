# WFM Phase A.1 — Baseline Verification

Status: COMPLETE
Branch: `wfm-phase-a1-baseline`
Baseline source: `main` at `ca1c327f79c5545f2b41c52872e8a9f293b9a039`
Validated branch commit: `17eefc728b2ca3445c5014c5db70f2c6635a3a71`
Validated CI run: `36697601284`

## Objective

Establish a safe, documented and reproducible starting point before production feature work. Phase A.1 does not redesign the WFM product. It validates the inherited prototype, removes baseline compile blockers, and records technical debt for later phases.

## Confirmed project surfaces

- Backend: NestJS + Prisma/PostgreSQL/PostGIS
- Web: Next.js 14
- Mobile: Expo / React Native
- API prefix: `/api/v1`
- Default backend port: `4000`
- Database container: PostgreSQL/PostGIS on `5432`

## Corrections and additions completed

- Created isolated `wfm-phase-a1-baseline` branch; `main` remained untouched during validation.
- Recovered the branch safely after an early CI tree mistake and verified the full repository tree was restored.
- Corrected NestJS path-parameter handling for NAP location, mismatch review, and report audit routes.
- Enabled TypeScript decorator metadata required by NestJS.
- Corrected report-controller parameter ordering for TypeScript compilation.
- Added safe environment templates for backend, web, and mobile without real secrets.
- Added mobile TypeScript configuration for repeatable type validation.
- Corrected the web signature API example so documentation text is not parsed as JSX expressions.
- Added the missing `react-native-webview` dependency used by the technician signature screen.
- Added GitHub Actions baseline validation for backend, web, and mobile.

## Validation result

GitHub Actions run `36697601284` completed successfully.

### Backend — PASS

- Dependency installation: PASS
- Prisma client generation: PASS
- NestJS/TypeScript production build: PASS

### Web — PASS

- Dependency installation: PASS
- Next.js production build and type checking: PASS

### Mobile — PASS

- Dependency installation: PASS
- TypeScript validation (`tsc --noEmit`): PASS

## Local startup order

1. Start PostgreSQL/PostGIS using Docker Compose.
2. Copy `backend/.env.example` to `backend/.env` and set local-only credentials.
3. Install backend dependencies and run Prisma generation/migrations.
4. Start backend on port 4000 and verify `/api/v1` endpoints.
5. Copy `web/.env.example` to `web/.env.local`, install dependencies, and start/build the management portal.
6. Copy `mobile/.env.example` to `mobile/.env`. For a physical technician phone, use the development PC LAN IP rather than localhost.
7. Install mobile dependencies and start Expo.

## Deferred production-hardening items

These are intentionally not Phase A.1 blockers and must be handled in later controlled phases:

- Replace demo authentication with secure authentication and RBAC.
- Move local Docker credentials to environment-based configuration before deployment.
- Generate and commit deterministic npm lockfiles after dependency versions are stabilized; CI currently uses `npm install` because the inherited prototype had no lockfiles.
- Review dependency audit findings and framework updates without blind forced upgrades.
- Enforce camera-only evidence and required evidence before WO completion.
- Implement real evidence/media storage.
- Complete durable offline synchronization, retries and idempotency.
- Complete GPS WebSocket persistence/stale-location behavior.
- Replace mock/random route/network intelligence data with production data sources.
- Implement actual external provider integrations behind the existing integration layer.

## Phase A.1 exit decision

PASS. The inherited WFM prototype now has a reproducibly compiling baseline across backend, web, and mobile. Feature development may proceed from this verified baseline using separate controlled phases.
