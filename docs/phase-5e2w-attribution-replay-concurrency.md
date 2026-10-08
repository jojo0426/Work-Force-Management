# Phase 5E.2W — Attribution Fail-Closed and PostgreSQL Key/Replay Concurrency

**Status: implementation pushed, CI pending. No production provider acceptance.**

1. **Evidence attribution safety:** Internal mock receipt ingestion no longer accepts operator/reviewer IDs from the receipt submitter. It writes the immutable evidence row as `validated: false` with explicit pending-attribution placeholders. This prevents a signed receipt from silently becoming a two-person-approved reconciliation record. The existing approval ledger rejects unvalidated evidence. Because the evidence registry is immutable, this is intentionally **fail-closed** until a separate authenticated attribution/validation workflow is designed; do not bypass it by editing immutable evidence.
2. **Two-connection PostgreSQL E2E:** A CI-only test checks that two independent database connections racing to insert receipts for the same request ID yield exactly one success, confirms durable uniqueness, verifies signing-key metadata from a second connection, and tests that revocation propagates across connections.
3. **CI:** The new isolated database test and mock attribution regression run alongside existing backend, web, mobile and reconciliation validations.

**Limitations:** This does not implement independently attributed evidence *registration* or an operational signing-key rotation service. A safe approval workflow needs a separate append-only authenticated attribution decision referencing the signed receipt, followed by verified evidence promotion in a transaction. Real provider keys, provider callbacks, identity attestation, and strict post-stop external request-start semantics remain unverified. No merge to main and no live provider activation.

**Next:** Phase 5E.2X — Append-only Authenticated Evidence Attribution Workflow and End-to-End Reconciliation Validation.
