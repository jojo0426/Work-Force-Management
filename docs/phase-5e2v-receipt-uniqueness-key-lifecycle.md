# Phase 5E.2V — Request-ID Uniqueness and Mock Signing Key Lifecycle

**Status: implemented on isolated branch; CI pending.**

- Added a unique database index on `IntegrationMockReceiptReplay.requestId` to reject a second receipt for the same synthetic provider request even if the timestamp/signature differ.
- Added `IntegrationMockSigningKey` metadata: key ID, SHA-256 secret fingerprint, validity window, revocation timestamp. Secret material is not stored in the database.
- Added `IntegrationMockKeyVerifierService`: requires active, nonrevoked key metadata, matching secret fingerprint, mock HMAC signature and timestamp validation. The internal ingestion service now requires this verifier. Added regression for wrong, expired and revoked keys.
- Existing evidence registry still records operator/reviewer identifiers supplied by the internal caller; **independent identity attribution is not implemented**. Do not treat it as complete two-person provider evidence attestation.
- Key rotation is supported as versioned key metadata and validity windows, **not** as a complete operational secret-manager rotation workflow. No actual secret manager integration or automated rotation.
- No real provider use, production receipt ingestion, main merge or auto-retry. Stop-versus-external-request start guarantee remains unresolved.

**Next:** Phase 5E.2W — Independently Attributed Evidence Registration and PostgreSQL Key/Replay Concurrency E2E.
