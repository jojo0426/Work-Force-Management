# WFM Phase 2 — Authentication & RBAC

Status: IMPLEMENTATION VALIDATED
Branch: `wfm-phase-2-auth-rbac`
Validated commit: `3cc0b7a5a3261d99f7253191d3369e1dec423c9e`
Validated CI run: `36701884493` (Run #11)

## Objective

Replace prototype/demo authentication with a controlled authentication and role-based authorization foundation for Technician, Job Controller, Supervisor, and Administrator users.

## Implemented security foundation

- Added `ADMINISTRATOR` to the Prisma `UserRole` model.
- Added `isActive` user-account state.
- Removed login-time automatic account creation and email-text role inference.
- Login now requires an existing active user with a valid bcrypt password hash.
- JWT configuration requires an explicit secret of at least 32 characters; no default fallback secret is accepted.
- JWT access tokens use an 8-hour lifetime.
- Added reusable JWT authentication guard.
- Added reusable RBAC roles decorator and roles guard.
- Added protected `GET /auth/me` endpoint.

## Work-order authorization

- Work-order controller is JWT protected.
- Technician, Job Controller, Supervisor, and Administrator can view work orders and verified NAP locations.
- Work-order batch upload/confirmation is limited to Job Controller, Supervisor, and Administrator.
- Nearby-technician lookup is management-only.
- Pending mismatch review and approval/rejection are Supervisor/Administrator-only.
- Technician smart-next requests are forced to the authenticated technician identity.
- Mismatch review actor is derived from the authenticated user.

## Technician field authorization

- Field workflow is JWT/RBAC protected.
- Technician assignments are constrained to the authenticated technician's team.
- Job start, measurements, evidence upload, and completion require Technician role and team assignment to the work order.
- Technician identity is derived from JWT rather than client-submitted IDs.
- Camera-only evidence is enforced server-side for the current evidence endpoint.
- Audit actions record the authenticated actor.
- Mismatch reports record the authenticated reporter.

## GPS and real-time location authorization

- HTTP GPS location updates are Technician-only and tied to the authenticated account.
- Coordinates are validated before storage.
- Management location visibility is limited to Job Controller, Supervisor, and Administrator.
- Disabled technician accounts are excluded from the management map response.
- Five-minute stale-location calculation is retained.
- Socket.IO GPS connections now require a valid JWT and active account.
- Real-time location updates are accepted only from authenticated Technician accounts.
- Client-supplied user IDs are no longer trusted for real-time tracking.
- Location broadcasts are scoped to the authenticated management room instead of global broadcast.

## Reports and audit authorization

- Reports, summaries, and exports are limited to Job Controller, Supervisor, and Administrator.
- Work-order audit trails are protected.
- Technicians may view audit history only for work orders assigned to their team.
- Technician-wide audit history is management-only.

## Phase 4 and integration authorization

- Customer signature submission is Technician-only and limited to work orders assigned to the technician's team.
- Technician route optimization is forced to the authenticated technician identity.
- Advanced analytics and network health are management-only.
- Workflow rule creation is Supervisor/Administrator-only.
- Workflow triggering is Job Controller/Supervisor/Administrator-only.
- Integration architecture and queue controls are Supervisor/Administrator-only.
- Pending integration processing is Administrator-only.

## Validation result

GitHub Actions run `36701884493` completed successfully against commit `3cc0b7a5a3261d99f7253191d3369e1dec423c9e`.

- Backend dependency installation: PASS
- Prisma client generation: PASS
- Backend NestJS/TypeScript build: PASS
- Web Next.js production build: PASS
- Mobile TypeScript validation: PASS

## Known follow-up hardening

The following are not represented as completed by this Phase 2 build validation and remain controlled follow-up work:

- Create a controlled user provisioning/admin workflow and initial administrator bootstrap process.
- Add database migration/seed strategy for existing environments after the schema role/account changes.
- Add automated authentication/RBAC integration tests for 401/403/allowed cases.
- Review npm dependency audit findings without blind `npm audit fix --force` upgrades.
- Upgrade deprecated/high-risk dependencies in controlled compatibility passes (including Multer 1.x and AWS SDK v2 where applicable).
- Tighten production CORS/origin policy for HTTP and WebSocket services.
- Add refresh-token/session revocation strategy if required by deployment policy.
- Complete durable media storage and evidence integrity controls.

## Phase 2 checkpoint decision

PASS for implementation/build validation. Authentication and RBAC foundations compile successfully across the WFM stack and the protected operational surfaces are now role-aware. Runtime database migration, provisioning, and authorization integration tests should be completed before production deployment.
