ALTER TYPE "WoStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';

CREATE TABLE "FieldException" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "technicianId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "notes" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "resolution" TEXT,
  "resumeAt" TIMESTAMP(3),
  CONSTRAINT "FieldException_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FieldException_workOrderId_status_reportedAt_idx" ON "FieldException"("workOrderId","status","reportedAt");
CREATE INDEX "FieldException_technicianId_reportedAt_idx" ON "FieldException"("technicianId","reportedAt");
ALTER TABLE "FieldException" ADD CONSTRAINT "FieldException_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldException" ADD CONSTRAINT "FieldException_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "JobExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
