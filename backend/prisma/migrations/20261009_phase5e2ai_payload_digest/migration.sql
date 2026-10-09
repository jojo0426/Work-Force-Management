ALTER TABLE "IntegrationWorkerGovernanceEvent"
ADD COLUMN "payloadDigest" TEXT;
ALTER TABLE "IntegrationWorkerGovernanceEvent"
ADD CONSTRAINT "IntegrationWorkerGovernanceEvent_payloadDigest_check"
CHECK ("payloadDigest" IS NULL OR "payloadDigest" ~ '^[a-f0-9]{64}$');
