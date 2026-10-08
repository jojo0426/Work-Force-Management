-- Phase 5A.1 durable integration queue foundation.
-- Persistence only. No external action execution is enabled here.

ALTER TABLE "IntegrationJob"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "maxRetries" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "claimToken" TEXT,
  ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX
  "IntegrationJob_sourceSystem_idempotencyKey_key"
  ON "IntegrationJob"("sourceSystem", "idempotencyKey");

CREATE INDEX
  "IntegrationJob_status_nextAttemptAt_createdAt_idx"
  ON "IntegrationJob"("status", "nextAttemptAt", "createdAt");

CREATE INDEX
  "IntegrationJob_claimToken_idx"
  ON "IntegrationJob"("claimToken");
