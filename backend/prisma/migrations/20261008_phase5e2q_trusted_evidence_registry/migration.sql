-- Phase 5E.2Q: internal evidence registry; no public approval endpoint.
CREATE TABLE "IntegrationProviderEvidence" (
  "id" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerRequestId" TEXT NOT NULL,
  "evidenceRef" TEXT NOT NULL,
  "confirmedOutcome" TEXT NOT NULL,
  "operatorId" TEXT NOT NULL,
  "reviewerId" TEXT NOT NULL,
  "validated" BOOLEAN NOT NULL DEFAULT false,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationProviderEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationProviderEvidence_admissionId_key" UNIQUE ("admissionId"),
  CONSTRAINT "IntegrationProviderEvidence_outcome_check" CHECK ("confirmedOutcome" IN ('CONFIRMED_APPLIED', 'CONFIRMED_NOT_APPLIED')),
  CONSTRAINT "IntegrationProviderEvidence_distinct_approvers" CHECK ("operatorId" <> "reviewerId")
);
CREATE TRIGGER "IntegrationProviderEvidence_immutable"
BEFORE UPDATE OR DELETE ON "IntegrationProviderEvidence"
FOR EACH ROW EXECUTE FUNCTION wfm_reconciliation_audit_immutable();
