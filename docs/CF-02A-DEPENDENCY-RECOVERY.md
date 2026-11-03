# CF-02A — WFM dependency security recovery

## Evidence (GitHub Actions baseline run #668, 2026-11-03)
- Web install, auth contracts and Next.js build passed; `npm audit --omit=dev --audit-level=high` failed with critical Next.js advisory. web/package.json pins Next.js 16.3.8.
- Backend audit failed with 11 vulnerabilities (8 moderate, 3 high); screenshot includes @nestjs/platform-express and qs. Other advisory details are not yet captured. Do not infer they are the only vulnerable packages.
- Mobile TypeScript validation passed.
- Existing CI run is not CF-02 compatibility acceptance; do not repeat all Phase 5E suites unnecessarily.

## Official vendor guidance
Next.js 16.4.1 is the security-patched 16.x version for the Oct 14 2026 image optimization, typed-array cache RCE, and Server Actions DoS advisories. See https://nextjs.org/blog/security-update-2026-10-14 and https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw. Verify no newer applicable advisories before deployment.

## Procedure
1. Work only on `engineering/cf-02a-dependency-security-recovery`; require clean working tree.
2. Run `powershell -ExecutionPolicy Bypass -File scripts/cf02a-remediate-local.ps1` from repository root.
3. Script updates web manifest and lockfile together to exact next@16.4.1, executes auth/cloud-config/build/security audit, then captures backend audit JSON without changing backend dependencies.
4. Review generated audit JSON locally (it is ignored? do NOT commit it unless sanitized), inspect each advisory and its compatible fixed versions. Apply minimal non-force backend upgrades only after NestJS/Prisma compatibility review.
5. Repeat focused regression tests; then CI; record exact package versions, lockfile diff, advisory status and rollback.
6. No remote deployment, preview build, secrets or live database changes.

**NO-GO** until web/backend high+critical advisories resolved and clean tests pass. This checkpoint is a remediation script and plan, not a verified dependency fix.
