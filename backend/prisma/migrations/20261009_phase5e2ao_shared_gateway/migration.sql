CREATE TABLE "IntegrationSharedGatewayControl" (
  "id" TEXT NOT NULL DEFAULT 'GLOBAL',
  "stopped" BOOLEAN NOT NULL DEFAULT true,
  "generation" BIGINT NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationSharedGatewayControl_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationSharedGatewayControl_generation_check" CHECK ("generation" >= 0)
);
CREATE TABLE "IntegrationSharedGatewayAttempt" (
  "requestId" TEXT NOT NULL,
  "generation" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settledAt" TIMESTAMP(3),
  CONSTRAINT "IntegrationSharedGatewayAttempt_pkey" PRIMARY KEY ("requestId"),
  CONSTRAINT "IntegrationSharedGatewayAttempt_status_check"
    CHECK ("status" IN ('RESERVED','UNKNOWN','SETTLED')),
  CONSTRAINT "IntegrationSharedGatewayAttempt_requestId_check"
    CHECK ("requestId" ~ '^[A-Za-z0-9_-]{16,100}$')
);
CREATE INDEX "IntegrationSharedGatewayAttempt_status_generation_idx"
  ON "IntegrationSharedGatewayAttempt" ("status","generation");
INSERT INTO "IntegrationSharedGatewayControl" ("id","stopped","generation")
VALUES ('GLOBAL',true,0);
