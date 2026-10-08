CREATE TABLE "IntegrationEvidenceAttribution" (
  "id" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "sessionHash" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationEvidenceAttribution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationEvidenceAttribution_action_check" CHECK ("action" IN ('ATTEST', 'REVIEW')),
  CONSTRAINT "IntegrationEvidenceAttribution_evidenceId_actorUserId_action_key"
    UNIQUE ("evidenceId", "actorUserId", "action")
);
CREATE INDEX "IntegrationEvidenceAttribution_evidenceId_action_idx"
  ON "IntegrationEvidenceAttribution"("evidenceId", "action");
CREATE TRIGGER "IntegrationEvidenceAttribution_immutable"
BEFORE UPDATE OR DELETE ON "IntegrationEvidenceAttribution"
FOR EACH ROW EXECUTE FUNCTION wfm_reconciliation_audit_immutable();
