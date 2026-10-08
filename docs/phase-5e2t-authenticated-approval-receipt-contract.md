# Phase 5E.2T — JWT-Bound Approval Endpoints and Mock Receipt Authenticity

**Status: implementation pushed; CI pending. No real provider activation.**

- JWT guard now stores a SHA-256 fingerprint of the **verified bearer token** on the request (never raw token). The guarded approval controller derives actor ID/role exclusively from `request.user`, not the body.
- Added role-guarded `POST /integration/reconciliation-approval/propose` and `/approve` endpoints. Only Supervisor/Administrator roles may record an event; the ledger checks active database user, immutable evidence registry match, proposal-first ordering, and distinct operator/reviewer. No public reconciliation/resolve endpoint exists.
- Added mock-only `verifyMockProviderReceipt()` with canonical payload HMAC-SHA256, constant-time signature comparison and 300-second timestamp bound; tampered or stale receipts fail. This is **a verification contract only**: it does not ingest receipts into the evidence registry or authorize real providers.
- Added regression for forged body actor, missing verified session binding, mock signature tampering and stale receipts.

## Remaining safety gaps
- Token fingerprints are not independently revocable sessions; distinct token fingerprints do not prove distinct human identities (database user ID checks do).
- The endpoint is authenticated through existing JWT guard and current database roles, but end-to-end HTTP authorization and replay tests are still required.
- Provider receipt HMAC is mock-only and not connected to trusted ingestion. Real provider canonicalization, key storage/rotation, nonce replay protection and signed status lookup remain unverified.
- No automatic reconciliation retry, real provider activation or main merge.
- Strict external request-start versus fleet-stop acknowledgement race remains unresolved.

**Next:** Phase 5E.2U — Verified Mock Receipt Ingestion, Replay Protection and Authenticated HTTP E2E.
