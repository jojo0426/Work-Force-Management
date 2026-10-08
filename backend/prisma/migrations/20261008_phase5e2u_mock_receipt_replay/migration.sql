-- Phase 5E.2U: mock receipt replay protection; no live provider use.
CREATE TABLE "IntegrationMockReceiptReplay" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "issuedAt" INTEGER NOT NULL,
  "signature" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationMockReceiptReplay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationMockReceiptReplay_requestId_issuedAt_signature_key" UNIQUE ("requestId", "issuedAt", "signature")
);
CREATE INDEX "IntegrationMockReceiptReplay_admissionId_idx" ON "IntegrationMockReceiptReplay"("admissionId");
