# Phase 5E.2Y — Full Synthetic Reconciliation PostgreSQL E2E

**Status: test implementation pushed; CI pending. No real provider activation.**

Added `integration-synthetic-reconciliation-database-e2e.ts`, an isolated GitHub Actions-only PostgreSQL test that refuses to run unless `GITHUB_ACTIONS=true` and the database URL targets `/wfm_ci`. The test creates synthetic stopped fleet control, MOCK job, uncertain admission, two privileged test users, and a synthetic signing-key metadata record.

It exercises the full persisted sequence: reject forged receipt signature; ingest valid signed mock receipt; verify unvalidated immutable evidence; reject duplicate receipt; reject reconciliation before attribution; reject review before attestation and self-review; persist distinct attestation and review; reject reconciliation before proposal and approval; reject swapped approval roles; record separate proposal and approval; reject forged reviewer; race two reconciliation calls and require exactly one success; verify RECONCILED admission and exactly one immutable audit; reject attribution mutation at the PostgreSQL trigger.

This test uses service calls with synthetic user actors, not real JWT-authenticated HTTP sessions for the entire sequence. The separate HTTP guard fixture covers role authentication but does not replace a production-session integration test.

**Safety boundaries:** No provider sandbox, no external network request, no real signing credentials, no real provider approval. Provider capability flags remain synthetic assertions. Strict external dispatch-start versus fleet-stop race remains unresolved. Do not merge to main or enable providers.

**Next:** Review CI results, correct any database or test-contract regressions, then consider Phase 5E.2Z — End-to-End HTTP Session Binding and Provider Evidence Provenance Hardening.
