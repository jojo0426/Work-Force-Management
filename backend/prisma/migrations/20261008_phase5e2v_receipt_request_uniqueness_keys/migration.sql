-- Phase 5E.2V: one accepted receipt per provider request ID.
CREATE UNIQUE INDEX "IntegrationMockReceiptReplay_requestId_key"
ON "IntegrationMockReceiptReplay"("requestId");

-- Synthetic signing-key metadata only; secret material stays outside DB.
CREATE TABLE "IntegrationMockSigningKey" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "validFrom" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationMockSigningKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationMockSigningKey_validity_check" CHECK ("validUntil" > "validFrom")
);
