CREATE TABLE "IntegrationWorkerGovernanceConsumption" (
  "approvalEventId" TEXT NOT NULL,
  "workerId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "consumedBy" TEXT NOT NULL,
  "consumedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationWorkerGovernanceConsumption_pkey" PRIMARY KEY ("approvalEventId"),
  CONSTRAINT "IntegrationWorkerGovernanceConsumption_approval_fkey"
    FOREIGN KEY ("approvalEventId") REFERENCES "IntegrationWorkerGovernanceEvent"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE OR REPLACE FUNCTION wfm_worker_governance_consumption_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'worker governance consumption is immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "IntegrationWorkerGovernanceConsumption_immutable"
BEFORE UPDATE OR DELETE ON "IntegrationWorkerGovernanceConsumption"
FOR EACH ROW EXECUTE FUNCTION wfm_worker_governance_consumption_immutable();
