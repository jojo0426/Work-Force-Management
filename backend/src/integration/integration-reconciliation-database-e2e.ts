import { PrismaClient } from '@prisma/client';
import { IntegrationReconciliationService } from './integration-reconciliation.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || '';
  if (process.env.GITHUB_ACTIONS !== 'true' || !/\/wfm_ci(?:\?|$)/.test(url)) {
    throw new Error('Refusing reconciliation E2E outside isolated GitHub Actions wfm_ci database');
  }
  const db = new PrismaClient();
  const stamp = Date.now().toString();
  const jobId = 'reconciliation-e2e-job-' + stamp;
  const admissionId = 'reconciliation-e2e-admission-' + stamp;
  const evidenceId = 'reconciliation-e2e-evidence-' + stamp;
  try {
    const existing = await db.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
    check('isolated fleet singleton absent', existing === null);
    await db.integrationFleetControl.create({ data: { id: 'GLOBAL', enabled: false } });
    await db.integrationJob.create({
      data: {
        id: jobId, sourceSystem: 'PHASE5E2Q_SYNTHETIC',
        targetSystem: 'MOCK', payload: {}, status: 'RECONCILIATION_REQUIRED',
      },
    });
    await db.integrationAdmission.create({
      data: {
        id: admissionId, jobId, claimToken: 'synthetic-claim',
        generation: 0n, status: 'UNCERTAIN',
      },
    });
    await db.integrationProviderEvidence.create({
      data: {
        id: evidenceId, admissionId, provider: 'MOCK',
        providerRequestId: 'synthetic-request-1', evidenceRef: 'synthetic/evidence-1',
        confirmedOutcome: 'CONFIRMED_NOT_APPLIED',
        operatorId: 'synthetic-operator', reviewerId: 'synthetic-reviewer',
        validated: true,
      },
    });
    const service = new IntegrationReconciliationService(db as any);
    const request = {
      admissionId, operatorId: 'synthetic-operator', reviewerId: 'synthetic-reviewer',
      provider: 'MOCK', providerRequestId: 'synthetic-request-1',
      outcome: 'CONFIRMED_NOT_APPLIED' as const, evidenceRef: 'synthetic/evidence-1',
      trustedEvidenceId: evidenceId, reasonCode: 'SYNTHETIC_VERIFIED',
      providerEvidence: {
        provider: 'MOCK', supportsIdempotency: true,
        supportsStatusLookup: true, idempotencyRetentionSeconds: 3600,
        validatedInSandbox: true,
      },
    };
    check('unmatched reviewer is denied',
      !(await service.resolveWithEvidence({ ...request, reviewerId: 'other-reviewer' })));
    const [first, second] = await Promise.all([
      service.resolveWithEvidence(request), service.resolveWithEvidence(request),
    ]);
    check('concurrent resolution admits exactly one', Number(first) + Number(second) === 1);
    const record = await db.integrationReconciliationAudit.findUnique({ where: { admissionId } });
    check('one durable audit row', !!record && record.evidenceRef === request.evidenceRef);
    const admission = await db.integrationAdmission.findUnique({ where: { id: admissionId } });
    check('admission settled', admission?.status === 'RECONCILED');
    let immutable = false;
    try {
      await db.integrationReconciliationAudit.update({
        where: { admissionId }, data: { reasonCode: 'TAMPERED' },
      });
    } catch { immutable = true; }
    check('database audit update trigger rejects tampering', immutable);
  } finally {
    // Audit/evidence are immutable; the entire CI database is ephemeral.
    // Do not attempt destructive cleanup of append-only records.
    await db.$disconnect();
  }
  console.log('Phase 5E.2Q isolated PostgreSQL reconciliation E2E passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
