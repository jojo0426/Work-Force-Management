-- Phase 4 operational models.
-- Brings the deployed database schema in sync with the Prisma models used by
-- route optimization, analytics, workflows, network health and integrations.

CREATE TABLE IF NOT EXISTS "CustomerSignature" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "executionId" TEXT,
  "signatureData" TEXT NOT NULL,
  "signedByName" TEXT NOT NULL,
  "signedByContact" TEXT,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "deviceInfo" JSONB,
  "isVerified" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "CustomerSignature_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CustomerSignature_workOrderId_executionId_idx" ON "CustomerSignature"("workOrderId", "executionId");
ALTER TABLE "CustomerSignature" ADD CONSTRAINT "CustomerSignature_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "OptimizedRoute" (
  "id" TEXT NOT NULL,
  "technicianId" TEXT,
  "teamId" TEXT,
  "date" TIMESTAMP(3) NOT NULL,
  "routeOrder" JSONB NOT NULL,
  "totalDistanceMeters" INTEGER,
  "totalDurationMinutes" INTEGER,
  "optimizationScore" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OptimizedRoute_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OptimizedRoute_technicianId_date_idx" ON "OptimizedRoute"("technicianId", "date");

CREATE TABLE IF NOT EXISTS "RouteHistory" (
  "id" BIGSERIAL NOT NULL,
  "technicianId" TEXT NOT NULL,
  "lat" DOUBLE PRECISION NOT NULL,
  "lng" DOUBLE PRECISION NOT NULL,
  "speedKmh" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RouteHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RouteHistory_technicianId_createdAt_idx" ON "RouteHistory"("technicianId", "createdAt");

CREATE TABLE IF NOT EXISTS "AnalyticsSnapshot" (
  "id" TEXT NOT NULL,
  "snapshotDate" TIMESTAMP(3) NOT NULL,
  "metrics" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "WorkflowRule" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "triggerEvent" TEXT NOT NULL,
  "conditionJson" JSONB,
  "actionType" TEXT NOT NULL,
  "actionConfig" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkflowRule_triggerEvent_isActive_idx" ON "WorkflowRule"("triggerEvent", "isActive");

CREATE TABLE IF NOT EXISTS "WorkflowExecution" (
  "id" TEXT NOT NULL,
  "ruleId" TEXT NOT NULL,
  "workOrderId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "result" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WorkflowExecution_ruleId_createdAt_idx" ON "WorkflowExecution"("ruleId", "createdAt");
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "WorkflowRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "NapHealth" (
  "id" TEXT NOT NULL,
  "napId" TEXT,
  "napCode" TEXT NOT NULL,
  "healthScore" INTEGER,
  "portUtilization" DOUBLE PRECISION,
  "recentIssuesCount" INTEGER NOT NULL DEFAULT 0,
  "avgRxPower" DOUBLE PRECISION,
  "lastChecked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "alerts" JSONB NOT NULL DEFAULT '[]',
  CONSTRAINT "NapHealth_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NapHealth_napCode_lastChecked_idx" ON "NapHealth"("napCode", "lastChecked");

CREATE TABLE IF NOT EXISTS "NetworkAlert" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "napId" TEXT,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "message" TEXT NOT NULL,
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NetworkAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "NetworkAlert_isResolved_createdAt_idx" ON "NetworkAlert"("isResolved", "createdAt");

CREATE TABLE IF NOT EXISTS "IntegrationJob" (
  "id" TEXT NOT NULL,
  "sourceSystem" TEXT NOT NULL,
  "targetSystem" TEXT,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "retries" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "IntegrationJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "IntegrationJob_status_createdAt_idx" ON "IntegrationJob"("status", "createdAt");

CREATE TABLE IF NOT EXISTS "Transfer" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "oldNapId" TEXT,
  "oldPort" INTEGER,
  "oldLat" DOUBLE PRECISION,
  "oldLng" DOUBLE PRECISION,
  "removalEvidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "newNapId" TEXT,
  "newPort" INTEGER,
  "newLat" DOUBLE PRECISION,
  "newLng" DOUBLE PRECISION,
  "installEvidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Transfer_workOrderId_createdAt_idx" ON "Transfer"("workOrderId", "createdAt");
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
