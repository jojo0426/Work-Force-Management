# Phase 5E.2R — Active Role Verification and Provider Evidence Trust Boundary

**Status: partial implementation; CI pending. No production acceptance.**

The internal reconciliation transaction now resolves both approver identifiers against the current `User` database table. Both must exist, be active, have `SUPERVISOR` or `ADMINISTRATOR` roles, and be distinct. Missing, disabled or nonprivileged users are rejected. The synthetic isolated PostgreSQL E2E now creates actual active Supervisor/Administrator records and uses those IDs in the immutable evidence registry. A mock regression denies missing eligible reviewers.

**Critical limits:**
- These checks confirm database identity and current role, **not** that two people independently authenticated and approved. The caller still supplies both IDs; no session-bound two-step approval, signed approval event or secure authenticated endpoint exists.
- `IntegrationProviderEvidence.validated` remains an internal database assertion, not a verified signed provider receipt. No trusted provider ingestion, request signature validation or live provider capability approval exists.
- No automatic retry, provider activation or external reconciliation is enabled. Strict post-stop network-start safety is still unresolved.

**Next:** 5E.2S — Session-Bound Two-Step Approval Ledger and Verified Provider Receipt Ingestion (mock-only until independently tested). Keep branch isolated; do not merge into main.
