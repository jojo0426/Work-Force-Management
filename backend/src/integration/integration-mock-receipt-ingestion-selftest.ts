import { createHmac } from 'crypto';
import { verifyMockProviderReceipt } from './provider-receipt-authenticity';
import { IntegrationMockReceiptIngestionService } from './integration-mock-receipt-ingestion.service';

function check(name: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  const now = 1_800_000_000;
  const secret = 'synthetic-only-receipt-secret-123456789012345';
  const receipt = {
    provider: 'MOCK', requestId: 'mock-request-1',
    outcome: 'CONFIRMED_NOT_APPLIED' as const, issuedAt: now,
  };
  const signatureHex = createHmac('sha256', secret)
    .update(JSON.stringify([receipt.provider, receipt.requestId, receipt.outcome, receipt.issuedAt]))
    .digest('hex');
  let saved = false;
  let writes = 0;
  let evidence: any = null;
  let mismatch = false;
  const prisma: any = {
    $transaction: async (fn: (tx: any) => Promise<any>) => {
      if (saved) throw new Error('Unique replay constraint');
      return fn(prisma);
    },
    integrationFleetControl: { findUnique: async () => ({ enabled: false }) },
    integrationAdmission: { findUnique: async () => ({ jobId: 'job-1', status: 'UNCERTAIN' }) },
    integrationJob: { findUnique: async () => ({
      targetSystem: 'MOCK', status: 'RECONCILIATION_REQUIRED',
      payload: { mockRequestId: mismatch ? 'different-request' : receipt.requestId },
    }) },
    integrationMockReceiptReplay: {
      create: async () => { saved = true; writes += 1; },
    },
    integrationProviderEvidence: { create: async ({ data }: any) => { evidence = data; writes += 1; } },
  };
  const service = new IntegrationMockReceiptIngestionService(prisma, {
    verify: async (r: any, sig: string, key: any, at: number) =>
      key.id === 'synthetic-key-v1' &&
      verifyMockProviderReceipt(r, sig, key.secret, at),
  } as any);
  const input = {
    admissionId: 'admission-1', evidenceRef: 'synthetic/receipt-1',
    receipt, signatureHex,
  };
  check('invalid signature rejected', !(await service.ingest({
    ...input, signatureHex: '0'.repeat(64),
  }, { id: 'synthetic-key-v1', secret }, now)).accepted && writes === 0);
  mismatch = true;
  check('wrong request binding rejected',
    !(await service.ingest(input, { id: 'synthetic-key-v1', secret }, now)).accepted && writes === 0);
  mismatch = false;
  check('valid mock receipt persisted',
    (await service.ingest(input, { id: 'synthetic-key-v1', secret }, now)).accepted && writes === 2);
  check('receipt cannot assert verified operator or reviewer',
    evidence?.validated === false &&
    evidence?.operatorId === 'PENDING_AUTHENTICATED_PROPOSAL' &&
    evidence?.reviewerId === 'PENDING_AUTHENTICATED_REVIEW');
  check('replayed receipt rejected',
    !(await service.ingest(input, { id: 'synthetic-key-v1', secret }, now)).accepted && writes === 2);
  console.log('Phase 5E.2U mock receipt ingestion regression passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
