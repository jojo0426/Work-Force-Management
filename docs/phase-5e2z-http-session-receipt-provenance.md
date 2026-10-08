# Phase 5E.2Z — HTTP Session Binding and Mock Receipt Provenance

**Status: implementation pushed; CI pending. Synthetic-only, no provider activation.**

- Added `integration-evidence-http-session-selftest.ts`, a real Nest HTTP listener exercising JWT and role guards for `/integration/evidence-attribution/{attest,review}` and `/integration/reconciliation-approval/{propose,approve}`. Synthetic token verifier and mock users test 401 unauthenticated/invalid, 403 technician, successful privileged access, and that actor IDs/session SHA-256 fingerprints come from verified bearer tokens rather than forged request body fields. This is not a production JWT issuer or session revocation test.
- Reconciliation of `validated=false` MOCK evidence now additionally checks the unique durable `IntegrationMockReceiptReplay` row matches the same admission/request ID, includes a well-formed signature, and that the immutable evidence reference contains the matching signature fingerprint. This closes the path where a pending registry row and attribution events alone could authorize reconciliation without recorded signed receipt ingestion. It does not revalidate provider HMAC against rotated keys at resolution time; initial ingestion performs verification.
- Phase 5E.2Y full synthetic E2E now asserts persisted receipt provenance.
- Repaired isolated PostgreSQL fixture preconditions: existing fleet singleton is permitted only when disabled. CI #492 previously failed at `isolated fleet singleton absent` before reaching the new test.

**Still not validated:** Real issuer JWT signatures and revocation; independently sourced real provider receipts, signing key lifecycle in a secret manager, full HTTP+PostgreSQL combined E2E, external request-start safety at fleet stop. Real provider integration remains disabled; no main merge.

**Next:** Inspect GitHub Actions and fix regressions before further phases.
