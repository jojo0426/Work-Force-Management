-- Phase 5E.2P: durable, append-only reconciliation audit.
CREATE TABLE "IntegrationReconciliationAudit" (
  "id" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerRequestId" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "evidenceRef" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationReconciliationAudit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationReconciliationAudit_admissionId_key" UNIQUE ("admissionId"),
  CONSTRAINT "IntegrationReconciliationAudit_outcome_check" CHECK ("outcome" IN ('CONFIRMED_APPLIED', 'CONFIRMED_NOT_APPLIED'))
);
CREATE INDEX "IntegrationReconciliationAudit_jobId_recordedAt_idx"
  ON "IntegrationReconciliationAudit"("jobId", "recordedAt");

CREATE FUNCTION wfm_reconciliation_audit_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Reconciliation audit entries are immutable';
END;
$$;
CREATE TRIGGER "IntegrationReconciliationAudit_immutable"
BEFORE UPDATE OR DELETE ON "IntegrationReconciliationAudit"
FOR EACH ROW EXECUTE FUNCTION wfm_reconciliation_audit_immutable();
