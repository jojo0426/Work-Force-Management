CREATE TABLE "IntegrationWorkerMembership" (
  "workerId" TEXT NOT NULL,
  "instanceToken" TEXT NOT NULL,
  "generation" BIGINT NOT NULL,
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "stopAckGeneration" BIGINT,
  "stopAckAt" TIMESTAMP(3),
  "activeAttempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "IntegrationWorkerMembership_pkey" PRIMARY KEY ("workerId"),
  CONSTRAINT "IntegrationWorkerMembership_activeAttempts_check" CHECK ("activeAttempts" >= 0)
);
CREATE INDEX "IntegrationWorkerMembership_generation_stopAckGeneration_idx"
ON "IntegrationWorkerMembership"("generation", "stopAckGeneration");
