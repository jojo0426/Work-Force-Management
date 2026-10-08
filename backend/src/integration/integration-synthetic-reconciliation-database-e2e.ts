import { createHash, createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { IntegrationMockKeyVerifierService } from './integration-mock-key-verifier.service';
import { IntegrationMockReceiptIngestionService } from './integration-mock-receipt-ingestion.service';
import { IntegrationEvidenceAttributionService } from './integration-evidence-attribution.service';
import { IntegrationApprovalLedgerService } from './integration-approval-ledger.service';
import { IntegrationReconciliationService } from './integration-reconciliation.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || '';
  if (process.env.GITHUB_ACTIONS !== 'true' || !/\/wfm_ci(?:\?|$)/.test(url)) {
    throw new Error('Refusing full synthetic E2E outside GitHub Actions wfm_ci');
  }
  const db = new PrismaClient();
  const stamp = Date.now().toString();
  const jobId = 'phase5e2y-job-' + stamp;
  const admissionId = 'phase5e2y-admission-' + stamp;
  const keyId = 'phase5e2y-key-' + stamp;
  const requestId = 'phase5e2y-request-' + stamp;
  const operatorId = 'phase5e2y-operator-' + stamp;
  const reviewerId = 'phase5e2y-reviewer-' + stamp;
  const secret = 'synthetic-phase5e2y-signing-secret-123456789';
  const now = 1800000000;
  const receipt = {
    provider: 'MOCK', requestId,
    outcome: 'CONFIRMED_NOT_APPLIED' as const, issuedAt: now,
  };
  const signatureHex = createHmac('sha256', secret)
    .update(JSON.stringify([receipt.provider, receipt.requestId, receipt.outcome, receipt.issuedAt]))
    .digest('hex');
  const operator = { userId: operatorId, role: 'SUPERVISOR' as const,
    sessionHash: 'a'.repeat(64) };
  const reviewer = { userId: reviewerId, role: 'ADMINISTRATOR' as const,
    sessionHash: 'b'.repeat(64) };
  try {
    const existing = await db.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
    check('isolated fleet control is stopped', !existing || existing.enabled === false);
    if (!existing) await db.integrationFleetControl.create({ data: { id: 'GLOBAL', enabled: false } });
    await db.integrationJob.create({
      data: {
        id: jobId, sourceSystem: 'PHASE5E2Y_SYNTHETIC',
        targetSystem: 'MOCK', payload: { mockRequestId: requestId },
        status: 'RECONCILIATION_REQUIRED',
      },
    });
    await db.integrationAdmission.create({
      data: { id: admissionId, jobId, claimToken: 'synthetic-claim',
        generation: 0n, status: 'UNCERTAIN' },
    });
    await db.user.createMany({ data: [
      { id: operatorId, name: 'Synthetic Attestor', role: 'SUPERVISOR', isActive: true },
      { id: reviewerId, name: 'Synthetic Reviewer', role: 'ADMINISTRATOR', isActive: true },
    ] });
    await db.integrationMockSigningKey.create({
      data: {
        id: keyId, fingerprint: createHash('sha256').update(secret).digest('hex'),
        validFrom: new Date((now - 60) * 1000),
        validUntil: new Date((now + 60) * 1000),
      },
    });
    const keys = new IntegrationMockKeyVerifierService(db as any);
    const ingest = new IntegrationMockReceiptIngestionService(db as any, keys);
    const input = {
      admissionId, evidenceRef: 'synthetic/phase5e2y',
      receipt, signatureHex,
    };
    check('tampered signature rejected',
      !(await ingest.ingest({ ...input, signatureHex: '0'.repeat(64) },
        { id: keyId, secret }, now)).accepted);
    const stored = await ingest.ingest(input, { id: keyId, secret }, now);
    check('signed synthetic receipt ingested', stored.accepted && !!stored.evidenceId);
    const evidenceId = stored.evidenceId!;
    const evidence = await db.integrationProviderEvidence.findUnique({ where: { id: evidenceId } });
    check('immutable evidence remains unvalidated', evidence?.validated === false);
    check('signed receipt provenance durably bound to admission',
      (await db.integrationMockReceiptReplay.findUnique({ where: { requestId } }))?.admissionId === admissionId);
    check('duplicate receipt denied',
      !(await ingest.ingest(input, { id: keyId, secret }, now)).accepted);
    const attribution = new IntegrationEvidenceAttributionService(db as any);
    const approval = new IntegrationApprovalLedgerService(db as any);
    const reconciliation = new IntegrationReconciliationService(db as any);
    const decision = {
      admissionId, operatorId, reviewerId, provider: 'MOCK',
      providerRequestId: requestId, outcome: receipt.outcome,
      evidenceRef: evidence!.evidenceRef, trustedEvidenceId: evidenceId,
      reasonCode: 'SYNTHETIC_VERIFIED',
      providerEvidence: {
        provider: 'MOCK', supportsIdempotency: true,
        supportsStatusLookup: true, idempotencyRetentionSeconds: 3600,
        validatedInSandbox: true,
      },
    };
    check('unattributed reconciliation denied',
      !(await reconciliation.resolveWithEvidence(decision)));
    check('review before attestation denied',
      !(await attribution.record(reviewer, evidenceId, 'REVIEW')));
    check('operator attestation persisted',
      await attribution.record(operator, evidenceId, 'ATTEST'));
    check('self-review denied',
      !(await attribution.record(operator, evidenceId, 'REVIEW')));
    check('independent review persisted',
      await attribution.record(reviewer, evidenceId, 'REVIEW'));
    check('reconciliation without approval denied',
      !(await reconciliation.resolveWithEvidence(decision)));
    check('reviewer cannot propose',
      !(await approval.record(reviewer, admissionId, evidenceId, 'PROPOSE')));
    check('operator proposal persisted',
      await approval.record(operator, admissionId, evidenceId, 'PROPOSE'));
    check('operator cannot approve',
      !(await approval.record(operator, admissionId, evidenceId, 'APPROVE')));
    check('reconciliation without reviewer approval denied',
      !(await reconciliation.resolveWithEvidence(decision)));
    check('reviewer approval persisted',
      await approval.record(reviewer, admissionId, evidenceId, 'APPROVE'));
    check('forged reviewer decision denied',
      !(await reconciliation.resolveWithEvidence({
        ...decision, reviewerId: operatorId,
      })));
    const results = await Promise.all([
      reconciliation.resolveWithEvidence(decision),
      reconciliation.resolveWithEvidence(decision),
    ]);
    check('concurrent reconciliation exactly once',
      Number(results[0]) + Number(results[1]) === 1);
    check('admission reconciled',
      (await db.integrationAdmission.findUnique({ where: { id: admissionId } }))?.status === 'RECONCILED');
    check('exactly one immutable reconciliation audit',
      (await db.integrationReconciliationAudit.count({ where: { admissionId } })) === 1);
    let immutable = false;
    try {
      await db.integrationEvidenceAttribution.updateMany({
        where: { evidenceId }, data: { action: 'ATTEST' },
      });
    } catch { immutable = true; }
    check('database rejects attribution event mutation', immutable);
  } finally {
    // Immutable evidence, attribution and audit persist in disposable CI DB.
    await db.$disconnect();
  }
  console.log('Phase 5E.2Y isolated synthetic receipt-to-reconciliation E2E passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
