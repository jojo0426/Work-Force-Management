-- Phase 5E.2S: session-bound approval ledger foundation.
CREATE TABLE "IntegrationApprovalEvent" (
  "id" TEXT NOT NULL,
  "admissionId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "sessionIdHash" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationApprovalEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IntegrationApprovalEvent_action_check" CHECK ("action" IN ('PROPOSE', 'APPROVE')),
  CONSTRAINT "IntegrationApprovalEvent_admissionId_actorUserId_action_key" UNIQUE ("admissionId", "actorUserId", "action")
);
CREATE INDEX "IntegrationApprovalEvent_admissionId_action_idx"
  ON "IntegrationApprovalEvent"("admissionId", "action");
CREATE TRIGGER "IntegrationApprovalEvent_immutable"
BEFORE UPDATE OR DELETE ON "IntegrationApprovalEvent"
FOR EACH ROW EXECUTE FUNCTION wfm_reconciliation_audit_immutable();
