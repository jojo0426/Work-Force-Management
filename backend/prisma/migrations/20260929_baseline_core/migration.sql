-- Core WFM database baseline.
-- This migration captures the schema that existed before the Phase 2/3 delta
-- migrations so a new environment can be built entirely from migration history.

CREATE TYPE "UserRole" AS ENUM ('TECHNICIAN', 'JOB_CONTROLLER', 'SUPERVISOR');
CREATE TYPE "UserStatus" AS ENUM ('ONLINE', 'WORKING', 'AVAILABLE', 'OFFLINE');
CREATE TYPE "WoType" AS ENUM ('REPAIR', 'INSTALLATION', 'TRANSFER');
CREATE TYPE "WoStatus" AS ENUM ('DRAFT', 'ASSIGNED', 'WORKING', 'COMPLETED', 'FB_ISSUE', 'CUST_ISSUE', 'CANCELLED');

CREATE TABLE "Team" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "teamId" TEXT,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "passwordHash" TEXT,
  "status" "UserStatus" NOT NULL DEFAULT 'OFFLINE',
  "lastLat" DOUBLE PRECISION,
  "lastLng" DOUBLE PRECISION,
  "lastLocationAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Nap" (
  "id" TEXT NOT NULL,
  "napCode" TEXT NOT NULL,
  "address" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "portCount" INTEGER NOT NULL DEFAULT 16,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedBy" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Nap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscriber" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "napId" TEXT,
  "napPort" INTEGER,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkOrder" (
  "id" TEXT NOT NULL,
  "woNumber" TEXT NOT NULL,
  "type" "WoType" NOT NULL,
  "status" "WoStatus" NOT NULL DEFAULT 'DRAFT',
  "subscriberId" TEXT,
  "oldNapId" TEXT,
  "oldPort" INTEGER,
  "newNapId" TEXT,
  "newPort" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 3,
  "remarks" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Assignment" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "assignedBy" TEXT,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobExecution" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "technicianId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "findings" TEXT,
  "rxPower" DOUBLE PRECISION,
  "downloadMbps" INTEGER,
  "uploadMbps" INTEGER,
  "pingMs" INTEGER,
  "napCodeReported" TEXT,
  "portReported" INTEGER,
  "status" "WoStatus",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Photo" (
  "id" TEXT NOT NULL,
  "executionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "s3Key" TEXT NOT NULL,
  "url" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LocationLog" (
  "id" BIGSERIAL NOT NULL,
  "userId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "status" "UserStatus" NOT NULL,
  "isStale" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LocationLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Mismatch" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT,
  "type" TEXT NOT NULL,
  "dbValue" TEXT,
  "reportedValue" TEXT NOT NULL,
  "reportedBy" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedBy" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Mismatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" BIGSERIAL NOT NULL,
  "workOrderId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Nap_napCode_key" ON "Nap"("napCode");
CREATE UNIQUE INDEX "WorkOrder_woNumber_key" ON "WorkOrder"("woNumber");
CREATE UNIQUE INDEX "Assignment_workOrderId_teamId_key" ON "Assignment"("workOrderId", "teamId");
CREATE INDEX "LocationLog_userId_createdAt_idx" ON "LocationLog"("userId", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "JobExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
