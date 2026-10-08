-- Phase 5E.2: durable control-plane foundation, fail closed by default.
-- Does NOT by itself wire scheduler/worker/executor or provide race-free fencing.
CREATE TABLE "IntegrationFleetControl" (
    "id" TEXT NOT NULL DEFAULT 'GLOBAL',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "generation" BIGINT NOT NULL DEFAULT 0,
    "stoppedAt" TIMESTAMP(3),
    "stoppedBy" TEXT,
    "reasonCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationFleetControl_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationAdmission" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "claimToken" TEXT NOT NULL,
    "generation" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ADMITTED',
    "admittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "IntegrationAdmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationAdmission_jobId_claimToken_idx" ON "IntegrationAdmission"("jobId", "claimToken");
CREATE INDEX "IntegrationAdmission_status_generation_idx" ON "IntegrationAdmission"("status", "generation");

-- No default enabled row is created. Missing row must be treated as disabled.
