CREATE TABLE "IntegrationWorkerGovernanceEvent" (
  "id" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "sessionHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationWorkerGovernanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationWorkerGovernanceEvent_action_check" CHECK ("action" IN ('PROPOSE','APPROVE')),
  CONSTRAINT "IntegrationWorkerGovernanceEvent_operation_check" CHECK ("operation" IN ('ENROLL','RETIRE','ROTATE')),
  CONSTRAINT "IntegrationWorkerGovernanceEvent_session_check" CHECK (length("sessionHash") = 64)
);
CREATE UNIQUE INDEX "IntegrationWorkerGovernanceEvent_workerId_operation_actorId_action_key"
ON "IntegrationWorkerGovernanceEvent"("workerId","operation","actorId","action");
CREATE INDEX "IntegrationWorkerGovernanceEvent_workerId_operation_action_idx"
ON "IntegrationWorkerGovernanceEvent"("workerId","operation","action");
CREATE OR REPLACE FUNCTION wfm_worker_governance_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'worker governance evidence is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IntegrationWorkerGovernanceEvent_immutable"
BEFORE UPDATE OR DELETE ON "IntegrationWorkerGovernanceEvent"
FOR EACH ROW EXECUTE FUNCTION wfm_worker_governance_immutable();
