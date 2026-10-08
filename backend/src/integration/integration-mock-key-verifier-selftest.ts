import { createHash, createHmac } from 'crypto';
import { IntegrationMockKeyVerifierService } from './integration-mock-key-verifier.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  const now = 1_800_000_000;
  const secret = 'synthetic-only-rotating-secret-123456789012345';
  const key = { id: 'mock-key-2026', secret };
  const receipt = {
    provider: 'MOCK', requestId: 'synthetic-unique-request',
    outcome: 'CONFIRMED_NOT_APPLIED' as const, issuedAt: now,
  };
  const signature = createHmac('sha256', secret)
    .update(JSON.stringify([receipt.provider, receipt.requestId, receipt.outcome, receipt.issuedAt]))
    .digest('hex');
  let revoked = false;
  let expired = false;
  const svc = new IntegrationMockKeyVerifierService({
    integrationMockSigningKey: { findUnique: async () => ({
      id: key.id, fingerprint: createHash('sha256').update(secret).digest('hex'),
      validFrom: new Date((now - 60) * 1000),
      validUntil: new Date((expired ? now - 1 : now + 60) * 1000),
      revokedAt: revoked ? new Date(now * 1000) : null,
    }) },
  } as any);
  check('active key verifies synthetic receipt',
    await svc.verify(receipt, signature, key, now));
  check('wrong key material denied',
    !(await svc.verify(receipt, signature, { ...key, secret: secret + '-wrong' }, now)));
  revoked = true;
  check('revoked key denied', !(await svc.verify(receipt, signature, key, now)));
  revoked = false; expired = true;
  check('expired key denied', !(await svc.verify(receipt, signature, key, now)));
  console.log('Phase 5E.2V signing key lifecycle selftest passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
