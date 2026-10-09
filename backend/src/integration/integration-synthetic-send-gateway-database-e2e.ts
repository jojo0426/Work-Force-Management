import { strict as assert } from 'assert';
import { PrismaClient } from '@prisma/client';
import { IntegrationSharedGatewayService } from './integration-shared-gateway.service';
import { IntegrationSyntheticSendGatewayService } from './integration-synthetic-send-gateway.service';

async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.WFM_SHARED_GATEWAY_FIXTURE !== 'true' ||
      process.env.WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE !== 'true' ||
      !new RegExp('[/]wfm_ci(?:[?]|$)').test(process.env.DATABASE_URL || '')) {
    throw new Error('isolated synthetic CI database required');
  }
  const a = new PrismaClient(), b = new PrismaClient();
  const control = new IntegrationSharedGatewayService(a as any);
  const sender = new IntegrationSyntheticSendGatewayService(b as any);
  const tag = 'phase5e2ap-' + Date.now();
  let sends = 0;
  try {
    const before = await control.inspect();
    assert(before?.stopped);
    const epoch = before.generation + 1n;
    assert.equal(await control.fixtureRearm(epoch), true);
    const id = tag + '-inflight';
    assert.equal(await control.reserve(id, epoch), 'RESERVED');
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const pending = new Promise<void>(resolve => { release = resolve; });
    const dispatched = sender.dispatch(id, epoch, async () => {
      sends++;
      entered();
      await pending;
    });
    await started;
    let acknowledged = false;
    const stop = control.stop(epoch + 1n).then(result => {
      acknowledged = true;
      return result;
    });
    // The stop must wait for the DB lock held by the synthetic callback.
    await new Promise(resolve => setTimeout(resolve, 75));
    assert.equal(acknowledged, false);
    release();
    assert.equal(await dispatched, 'SYNTHETIC_SENT');
    const stopped = await stop;
    assert.equal(stopped.admissionsClosed, true);
    assert.equal(stopped.externallyQuiescent, false);
    assert(stopped.unresolvedAttempts !== null && stopped.unresolvedAttempts >= 1);
    assert.equal(await sender.dispatch(id, epoch, async () => { sends++; }),
      'ALREADY_ATTEMPTED');
    const lateId = tag + '-late';
    assert.equal(await control.reserve(lateId, epoch), 'STOPPED');
    // Simulate previously reserved work with a delayed send attempt.
    const previouslyReserved = tag + '-prestop';
    await b.integrationSharedGatewayAttempt.create({
      data: { requestId: previouslyReserved, generation: epoch, status: 'RESERVED' },
    });
    assert.equal(await sender.dispatch(previouslyReserved, epoch, async () => { sends++; }),
      'STOPPED');
    assert.equal(sends, 1);
    const attempt = await a.integrationSharedGatewayAttempt.findUnique({ where: { requestId: id } });
    assert.equal(attempt?.status, 'UNKNOWN');
    console.log('PASS: cross-client STOP waits for synthetic callback boundary');
    console.log('PASS: delayed sender denied, duplicate not re-executed');
    console.log('PASS: external outcome remains UNKNOWN; provider quiescence never claimed');
  } finally {
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
