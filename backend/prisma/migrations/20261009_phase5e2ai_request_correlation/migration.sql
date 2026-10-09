ALTER TABLE "IntegrationWorkerGovernanceEvent" ADD COLUMN "requestId" TEXT;
ALTER TABLE "IntegrationWorkerGovernanceEvent"
  ADD CONSTRAINT "IntegrationWorkerGovernanceEvent_requestId_check"
  CHECK ("requestId" IS NULL OR "requestId" ~ '^[A-Za-z0-9_-]{16,100}$');
CREATE INDEX "IntegrationWorkerGovernanceEvent_requestId_action_idx"
  ON "IntegrationWorkerGovernanceEvent"("requestId","action");
