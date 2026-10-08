import { IntegrationReconciliationService } from './integration-reconciliation.service';

function check(name: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  let writes = 0;
  let calls = 0;
  let status = 'UNCERTAIN';
  let approversEnabled = true;
  const db: any = {
    $transaction: async (fn: (tx: any) => Promise<boolean>) => fn(db),
    $queryRaw: async () => {
      calls += 1;
      return calls % 2 === 1
        ? [{ enabled: false }]
        : [{ id: 'admission-1', jobId: 'job-1', status }];
    },
    integrationJob: { findUnique: async () => ({ status: 'RECONCILIATION_REQUIRED' }) },
    integrationProviderEvidence: {
      findUnique: async () => ({
        admissionId: 'admission-1', provider: 'MOCK',
        providerRequestId: 'provider-request-1', evidenceRef: 'evidence/ref-123',
        confirmedOutcome: 'CONFIRMED_NOT_APPLIED', operatorId: 'operator-1',
        reviewerId: 'reviewer-2', validated: true,
      }),
    },
    user: { findMany: async () => approversEnabled
      ? [{ id: 'operator-1' }, { id: 'reviewer-2' }]
      : [{ id: 'operator-1' }] },
    integrationApprovalEvent: { findMany: async () => [
      { action: 'PROPOSE', actorUserId: 'operator-1', sessionIdHash: 'session-hash-a' },
      { action: 'APPROVE', actorUserId: 'reviewer-2', sessionIdHash: 'session-hash-b' },
    ] },
    integrationReconciliationAudit: {
      create: async () => { writes += 1; },
    },
    integrationAdmission: {
      updateMany: async () => { status = 'RECONCILED'; return { count: 1 }; },
    },
  };
  const svc = new IntegrationReconciliationService(db);
  const request: any = {
    admissionId: 'admission-1', operatorId: 'operator-1',
    reviewerId: 'reviewer-2', provider: 'MOCK',
    providerRequestId: 'provider-request-1', outcome: 'CONFIRMED_NOT_APPLIED',
    evidenceRef: 'evidence/ref-123', trustedEvidenceId: 'registry-evidence-1',
    reasonCode: 'PROVIDER_LOOKUP',
    providerEvidence: {
      provider: 'MOCK', supportsIdempotency: true,
      supportsStatusLookup: true, idempotencyRetentionSeconds: 3600,
      validatedInSandbox: true,
    },
  };
  check('same operator and reviewer rejected',
    !(await svc.resolveWithEvidence({ ...request, reviewerId: request.operatorId })) && writes === 0);
  check('unvalidated provider rejected',
    !(await svc.resolveWithEvidence({
      ...request, providerEvidence: { ...request.providerEvidence, validatedInSandbox: false },
    })) && writes === 0);
  approversEnabled = false;
  check('missing active reviewer denies reconciliation',
    !(await svc.resolveWithEvidence(request)) && writes === 0);
  approversEnabled = true;
  check('complete evidence allows one atomic resolution',
    await svc.resolveWithEvidence(request) && writes === 1 && status === 'RECONCILED');
  check('repeated resolution rejected', !(await svc.resolveWithEvidence(request)) && writes === 1);
  const legacy = await (await import('./integration-fleet-control.service'))
    .IntegrationFleetControlService.prototype.markAdmissionReconciled.call({}, 'admission-1');
  check('legacy unaudited resolution blocked', legacy === false);
  console.log('Phase 5E.2P reconciliation safety selftest passed (mock-only).');
}
main().catch(error => { console.error(error); process.exit(1); });
