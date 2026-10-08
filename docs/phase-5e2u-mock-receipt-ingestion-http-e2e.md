# Phase 5E.2U — Synthetic Signed Receipt Ingestion, Replay Defense and HTTP Fixture

**Status: implemented on isolated branch; CI pending. Not production approval.**

- Added durable `IntegrationMockReceiptReplay` ledger with a unique `requestId + issuedAt + signature` key. Ingestion verifies mock HMAC signature and 300-second timestamp, requires stopped fleet, unresolved admission, nonprocessing job, MOCK target, and matching persisted `payload.mockRequestId`. It atomically creates the replay marker and immutable provider evidence registry row. Duplicate/replayed receipts fail closed.
- Internal `IntegrationMockReceiptIngestionService` has **no public ingestion endpoint**. The caller supplies the synthetic signing secret through an internal invocation; real provider credentials are not supported.
- Added synthetic receipt regression: signature forgery, mismatched request ID, valid ingestion and duplicate rejection.
- Added HTTP fixture using a Nest application and the actual JWT/Roles guards, with synthetic token verifier and mock users. It checks 401 unauthenticated, 403 technician, 201 supervisor and request-body actor forgery rejection. This is **not a production identity-provider E2E**.

**Known gaps:** Receipt verification is MOCK only; the registry's operator/reviewer IDs are supplied by the internal caller and must not be trusted for real providers. Replay uniqueness is exact receipt uniqueness, not comprehensive request-ID uniqueness across different timestamps/signatures. No real provider signing keys, key rotation, provider status lookup, webhook ingestion, or sandbox evidence is validated. No real provider activation, auto-retry, or merge to main. External dispatch-start race remains unresolved.

**Next:** 5E.2V — Provider Receipt Request-ID Uniqueness, Durable Key Rotation and Independent Evidence Attribution.
