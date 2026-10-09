DROP INDEX IF EXISTS "IntegrationWorkerGovernanceEvent_workerId_operation_actorId_action_key";
CREATE UNIQUE INDEX "IntegrationWorkerGovernanceEvent_requestId_actorId_action_key"
  ON "IntegrationWorkerGovernanceEvent"("requestId","actorId","action");
