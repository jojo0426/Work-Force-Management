import { strict as assert } from 'assert';
import { PrismaClient } from '@prisma/client';
import { IntegrationSharedGatewayService } from './integration-shared-gateway.service';

async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.WFM_SHARED_GATEWAY_FIXTURE !== 'true' ||
      !new RegExp('[/]wfm_ci(?:[?]|$)').test(process.env.DATABASE_URL || '')) {
    throw new Error('isolated PostgreSQL fixture required');
  }
  const a = new PrismaClient(), b = new PrismaClient();
  const gateA = new IntegrationSharedGatewayService(a as any);
  const gateB = new IntegrationSharedGatewayService(b as any);
  const tag = 'phase5e2ao-' + Date.now();
  const request = tag + '-reserved';
  const delayed = tag + '-delayed';
  try {
    const before = await gateA.inspect();
    assert(before?.stopped, 'migration starts with STOP');
    assert.equal(await gateA.reserve(request, 0n), 'STOPPED');
    assert.equal(await gateA.fixtureRearm(1n), true);
    const contenders = await Promise.all([
      gateA.reserve(request, 1n), gateB.reserve(request, 1n),
    ]);
    assert.deepEqual(contenders.sort(), ['DUPLICATE', 'RESERVED']);
    const stopped = await gateB.stop(2n);
    assert.equal(stopped.admissionsClosed, true);
    assert.equal(stopped.externallyQuiescent, false);
    assert.equal(stopped.unresolvedAttempts, 1);
    assert.equal(await gateA.reserve(delayed, 1n), 'STOPPED');
    assert.equal(await gateA.reserve(tag + '-fresh', 2n), 'STOPPED');
    assert.equal(await gateB.markUnknown(request), true);
    const recovered = await gateA.inspect();
    assert.equal(recovered?.unresolvedAttempts, 1);
    assert.equal(recovered?.externallyQuiescent, false);
    assert.equal(await gateB.fixtureRearm(3n), false,
      'unresolved attempts block rearm');
    const persisted = await b.integrationSharedGatewayAttempt.findUnique({
      where: { requestId: request },
    });
    assert.equal(persisted?.status, 'UNKNOWN');
    console.log('PASS: two independent PostgreSQL clients serialize reserve and STOP');
    console.log('PASS: post-STOP admission denied and crash outcome preserved UNKNOWN');
    console.log('PASS: unresolved attempt prevents rearm; provider quiescence unproven');
  } finally {
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
