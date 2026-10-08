# Phase 5E.2X — Append-Only Authenticated Evidence Attribution

**Status: implementation pushed, CI pending. Mock-only foundation, not full E2E acceptance.**

- Added immutable `IntegrationEvidenceAttribution` event ledger (ATTEST/REVIEW) with unique actor/action and database trigger against updates/deletes.
- Added JWT- and role-guarded `POST /integration/evidence-attribution/attest` and `/review`. Actor ID, role and token fingerprint come from the existing verified JWT guard, not the request body. Database rechecks active privileged users, stopped fleet and unresolved attempt; reviewer must differ from attestor and session fingerprint.
- Existing immutable mock receipt evidence remains `validated=false`. The approval ledger and internal reconciliation service now allow **MOCK-only** pending evidence only if two separate attributed events exist, followed by two approval events. Other providers continue requiring the prior validated registry contract.
- Repaired the Phase 5E.2W failing TypeScript selftest that passed a string instead of a signing key descriptor.
- Added mock-only attribution selftest to CI. Existing isolated PostgreSQL reconciliation and two-connection receipt tests remain enabled.

**Not yet complete:** The new full sequence (receipt ingestion -> authenticated attestation -> review -> approval -> reconciliation) does **not yet have a single isolated PostgreSQL E2E**. The reconciliation service still accepts caller-supplied provider capability flags and an internal caller-selected operator/reviewer; matching authenticated ledger records limit this, but real provider attestation and operational authority are not established. No provider activation or merge to main.

**Next:** Phase 5E.2Y — Full Synthetic Reconciliation PostgreSQL E2E and Adversarial Attribution Tests.
