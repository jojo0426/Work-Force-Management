import { createHash, createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { IntegrationMockKeyVerifierService } from './integration-mock-key-verifier.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || '';
  if (process.env.GITHUB_ACTIONS !== 'true' || !/\/wfm_ci(?:\?|$)/.test(url)) {
    throw new Error('Refusing mock receipt database E2E outside isolated CI database');
  }
  const first = new PrismaClient();
  const second = new PrismaClient();
  const stamp = Date.now().toString();
  const requestId = 'mock-concurrent-request-' + stamp;
  const keyId = 'mock-concurrent-key-' + stamp;
  const secret = 'synthetic-key-only-abcdefghijklmnopqrstuvwxyz123';
  const now = 1800000000;
  const receipt = {
    provider: 'MOCK', requestId,
    outcome: 'CONFIRMED_NOT_APPLIED' as const, issuedAt: now,
  };
  const sign = (outcome: string, at: number) =>
    createHmac('sha256', secret)
      .update(JSON.stringify(['MOCK', requestId, outcome, at]))
      .digest('hex');
  try {
    await first.integrationMockSigningKey.create({
      data: {
        id: keyId,
        fingerprint: createHash('sha256').update(secret).digest('hex'),
        validFrom: new Date((now - 60) * 1000),
        validUntil: new Date((now + 60) * 1000),
      },
    });
    const verifier = new IntegrationMockKeyVerifierService(second as any);
    check('independent connection validates key metadata',
      await verifier.verify(receipt, sign(receipt.outcome, now),
        { id: keyId, secret }, now));
    const data = (id: string, at: number, signature: string) => ({
      id, requestId, issuedAt: at, signature,
      admissionId: 'synthetic-admission-' + stamp,
    });
    const results = await Promise.allSettled([
      first.integrationMockReceiptReplay.create({
        data: data('replay-a-' + stamp, now, sign(receipt.outcome, now)),
      }),
      second.integrationMockReceiptReplay.create({
        data: data('replay-b-' + stamp, now + 1,
          sign('CONFIRMED_APPLIED', now + 1)),
      }),
    ]);
    check('two connections permit exactly one receipt per request ID',
      results.filter(result => result.status === 'fulfilled').length === 1);
    check('durable request ID uniqueness',
      (await second.integrationMockReceiptReplay.count({ where: { requestId } })) === 1);
    await first.integrationMockSigningKey.update({
      where: { id: keyId }, data: { revokedAt: new Date(now * 1000) },
    });
    check('second connection sees key revocation',
      !(await verifier.verify(receipt, sign(receipt.outcome, now),
        { id: keyId, secret }, now)));
  } finally {
    await first.integrationMockReceiptReplay.deleteMany({ where: { requestId } });
    await first.integrationMockSigningKey.deleteMany({ where: { id: keyId } });
    await Promise.all([first.$disconnect(), second.$disconnect()]);
  }
  console.log('Phase 5E.2W isolated PostgreSQL key/replay concurrency passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
