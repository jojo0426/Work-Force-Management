CREATE TABLE "IntegrationExpectedWorker" (
  "workerId" TEXT NOT NULL,
  "credentialHash" TEXT NOT NULL,
  "approvedBy" TEXT NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "IntegrationExpectedWorker_pkey" PRIMARY KEY ("workerId"),
  CONSTRAINT "IntegrationExpectedWorker_hash_check" CHECK (length("credentialHash") = 64)
);
-- The Phase 5E.2AE instanceToken column remains for backwards compatibility
-- and must be migrated before production use; no live worker path is enabled.
