# FiberBlaze WFM — Controlled Beta Development

## Current Development Branch

Active development: `wfm-phase-5e-sandbox-acceptance`. Phase 5E gateway work is an isolated synthetic prototype; **G1 remains OPEN and production remains NO-GO**. The Phase 3 merged checkpoint below is historical and does not describe all development-branch work.

The CI #660 transport-policy failure was a rejection-category assertion mismatch. [Fix commit 6e7a7ad](https://github.com/jojo0426/Work-Force-Management/commit/6e7a7adc5d0bef27241cecaf41d31822fd2f7e7a) passed [baseline #661](https://github.com/jojo0426/Work-Force-Management/actions/runs/38049105185). Later changes require their own successful acceptance runs.

Current acceptance requirements and reproducible checks: [controlled beta validation](docs/controlled-beta-validation.md). Gateway scope and open production gates: [Phase 5E.2AQ](docs/phase-5e2aq-gateway-trust-boundary.md). GPS socket security now rechecks token expiry, active account status and current roles before updates or sensitive live-location delivery; `npm run test:gps-session` covers stale authorization.

## Merged Baseline

**Status:** Phase 3 work-order dispatch and technician lifecycle completed and merged on October 1, 2026 ([PR #1](https://github.com/jojo0426/Work-Force-Management/pull/1)). This is a validated implementation checkpoint before the next WFM phase, not a declaration that the entire production system is final.
**Repo:** jojo0426/Work-Force-Management

## Current Capabilities
- **Backend:** NestJS + Prisma, PostgreSQL/PostGIS setup, ExcelJS-based Excel import, JWT authentication and role checks, work-order lifecycle enforcement, evidence handling, GPS and audit modules.
- **Mobile:** Expo SDK 50 technician app with camera evidence, location support, local cache/offline queue, and server-authoritative work-order synchronization.
- **Web:** Next.js 16 + Mapbox GL + Tailwind, authentication contract, and work-order import/assignment/dispatch workflows.
- **Lifecycle reliability:** guarded Start, Field Issue, Evidence, and Finish mutations; reconciliation after management removal or status changes; stale local workflow invalidation; synchronization and management-race regression coverage.

## Architecture
WEB PORTAL (Job Controller/Supervisor) + TECHNICIAN APP → CENTRAL WFM API → DATABASE/PHOTO/GPS/AUDIT/REPORTS → INTEGRATION LAYER

## Quick Start

### 1. Database (Postgres + PostGIS)
```bash
docker-compose up -d postgres
# or use Supabase/Neon with PostGIS extension
```

### 2. Backend API
```bash
cd backend
npm install
cp .env.example .env
# Edit DATABASE_URL, JWT_SECRET
npx prisma migrate dev --name phase1_init
npx prisma generate
npm run start:dev
# API at http://localhost:4000/api/v1
# Swagger at http://localhost:4000/docs (if enabled)
```

### 3. Web Portal
```bash
cd web
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
# Set NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token
npm run dev # http://localhost:3000
```

### 4. Mobile (Technician App)
```bash
cd mobile
npm install
cp .env.example .env
# Set EXPO_PUBLIC_API_URL=http://YOUR_IP:4000/api/v1
npx expo start
# Scan QR with Expo Go
```

## Key Flows Implemented

### Dispatch and Technician Lifecycle
- Import, validate, and assign work orders through the management workflow.
- Technicians synchronize assigned work orders from the server and execute Start, evidence submission, field-exception, and Finish actions.
- Backend authorization and lifecycle guards enforce valid mutations against the current work-order state.
- Management removal or status changes reconcile into the technician client and invalidate stale local workflows.

### Evidence and Field Exceptions
- Technician camera evidence and evidence lifecycle checks support work-order execution.
- Finish gates validate required evidence and lifecycle conditions.
- Field-exception lifecycle behavior has database-backed E2E and regression coverage.

### Synchronization and Concurrency
- Server state is authoritative for technician work-order synchronization.
- Local cache and offline queue support field work; stale actions are checked against current server state.
- Regression gates cover Finish, Start, assignment, import concurrency, client/server contracts, mobile synchronization, and stale actions.
- Formatting-independent synchronization and management-race checks protect against stale client state and concurrent management changes.

## Validation and CI
The merged Phase 3 checkpoint records **WFM Baseline Validation #160: PASS**, including:
- Database-backed operational E2E.
- Database-backed field-exception lifecycle E2E.
- Security validation, including authentication/RBAC, evidence/Finish gates, synchronization contracts, and race regressions.
- Backend build.
- Web authentication contract and production build.
- Mobile TypeScript validation.
- Production dependency audit gates for backend and web.

[WFM Baseline Validation](.github/workflows/baseline.yml) runs on pull requests targeting `main`, pushes to `main` and the listed phase branches, and manual dispatch. [Commit 47eeca27b0ac4ca01dea565b77ffc0a811d94cee](https://github.com/jojo0426/Work-Force-Management/commit/47eeca27b0ac4ca01dea565b77ffc0a811d94cee) added push validation for `main`.

CI uses Node.js 24 and a clean PostgreSQL 16 database, validates the Prisma schema, and applies production migrations before database E2E checks. Backend and web production audits fail on high-severity findings. The mobile audit remains visible but non-blocking because Expo SDK 50 brings known build/CLI transitive dependency vulnerabilities; a passing workflow does not mean the mobile dependency audit is clean.

Passing these checks establishes the documented Phase 3 checkpoint. Mobile TypeScript validation is not a device/runtime test, and CI does not by itself establish live production deployment readiness.

### Reproduce the CI Checks
Use a disposable PostgreSQL database for database-backed E2E checks and configure `DATABASE_URL` before running them.

```bash
cd backend
npm install --no-fund
npm run prisma:generate
npx prisma validate
npm run prisma:migrate:deploy
npm run test:database-e2e
npm run test:field-exception-database-e2e
npm run test:security
npm run build
npm audit --omit=dev --audit-level=high
```

```bash
cd web
npm install --no-fund
npm run test:auth-contract
npm run build
npm audit --omit=dev --audit-level=high
```

```bash
cd mobile
npm install --no-fund
npx tsc --noEmit
npm audit --omit=dev --audit-level=high
# CI reports the mobile audit without making it a blocking gate.
```

## Env Vars
See .env.example in each package.

## Phase 3 Completed Checkpoint
- [x] Work-order dispatch and technician lifecycle slice merged in PR #1.
- [x] Server-authoritative technician synchronization.
- [x] Management removal/status-change reconciliation and stale workflow invalidation.
- [x] Guarded Start / Field Issue / Evidence / Finish mutations.
- [x] Operational and field-exception database E2E validation.
- [x] Security, synchronization, and concurrency/race regression gates.
- [x] Backend build, web auth/build, and mobile TypeScript validation.
- [x] Backend/web production dependency audit gates.
- [x] Baseline validation on pushes to main.
- [ ] Resolve mobile dependency audit findings through a planned Expo upgrade and runtime validation.
- [ ] Complete the next implementation phase and deployment/device acceptance checks before declaring the full system production-ready.

## Next Phase Roadmap
Phase 3 is the completed baseline for the next WFM implementation phase. Define and review that phase's scope and acceptance criteria, preserve the existing regression gates, and add validation for each new capability.

Remaining readiness work includes mobile dependency modernization, device testing of camera/location/offline recovery, and environment-specific deployment and operational acceptance. GPS/Nearby, reporting, audit, and integration capabilities should be assessed against explicit acceptance criteria before being described as fully production-ready. The repository does not establish a completed “Phase 4 FINAL” release or a new six-week delivery commitment.

---
Built for FiberBlaze — Dasmariñas, PH
