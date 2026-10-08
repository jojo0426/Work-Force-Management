import { createHmac } from 'crypto';
import { verifyMockProviderReceipt } from './provider-receipt-authenticity';
import { IntegrationApprovalController } from './integration-approval.controller';

function check(name: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  const now = 1_800_000_000;
  const secret = 'synthetic-mock-only-test-secret-1234567890';
  const receipt = {
    provider: 'MOCK', requestId: 'synthetic-request',
    outcome: 'CONFIRMED_APPLIED' as const, issuedAt: now,
  };
  const sign = (r: typeof receipt) => createHmac('sha256', secret)
    .update(JSON.stringify([r.provider, r.requestId, r.outcome, r.issuedAt]))
    .digest('hex');
  check('valid mock receipt signature', verifyMockProviderReceipt(receipt, sign(receipt), secret, now));
  check('tampered mock receipt rejected',
    !verifyMockProviderReceipt({ ...receipt, outcome: 'CONFIRMED_NOT_APPLIED' },
      sign(receipt), secret, now));
  check('stale mock receipt rejected',
    !verifyMockProviderReceipt(receipt, sign(receipt), secret, now + 301));
  const recorded: any[] = [];
  const controller = new IntegrationApprovalController({
    record: async (...args: any[]) => { recorded.push(args); return true; },
  } as any);
  const req = {
    user: { id: 'authenticated-supervisor', role: 'SUPERVISOR' },
    authSessionHash: 'a'.repeat(64),
  };
  check('authenticated request identity used, not body identity',
    (await controller.propose(req, {
      admissionId: 'admission-1', evidenceId: 'evidence-1',
      operatorId: 'forged-actor',
    } as any)).recorded &&
    recorded[0][0].userId === 'authenticated-supervisor');
  check('missing verified session binding denied',
    !(await controller.approve({ user: req.user }, {
      admissionId: 'admission-1', evidenceId: 'evidence-1',
    })).recorded);
  console.log('Phase 5E.2T authenticated boundary and mock receipt selftest passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
