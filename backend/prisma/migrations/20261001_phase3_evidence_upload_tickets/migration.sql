-- Phase 3: server-authorized evidence upload tickets.
CREATE TABLE "EvidenceUploadTicket" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "technicianId" TEXT NOT NULL,
  "evidenceType" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ISSUED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "photoId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvidenceUploadTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EvidenceUploadTicket_storageKey_key" ON "EvidenceUploadTicket"("storageKey");
CREATE UNIQUE INDEX "EvidenceUploadTicket_photoId_key" ON "EvidenceUploadTicket"("photoId");
CREATE INDEX "EvidenceUploadTicket_workOrderId_executionId_technicianId_status_idx" ON "EvidenceUploadTicket"("workOrderId", "executionId", "technicianId", "status");
CREATE UNIQUE INDEX "Photo_s3Key_key" ON "Photo"("s3Key");
ALTER TABLE "EvidenceUploadTicket" ADD CONSTRAINT "EvidenceUploadTicket_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceUploadTicket" ADD CONSTRAINT "EvidenceUploadTicket_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "JobExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EvidenceUploadTicket" ADD CONSTRAINT "EvidenceUploadTicket_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
