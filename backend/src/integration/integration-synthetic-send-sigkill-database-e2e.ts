import { strict as assert } from 'assert';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import { once } from 'events';
import { randomUUID } from 'crypto';
import { IntegrationSharedGatewayService } from './integration-shared-gateway.service';
import { IntegrationSyntheticSendGatewayService } from './integration-synthetic-send-gateway.service';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL || '';
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.WFM_SHARED_GATEWAY_FIXTURE !== 'true' ||
      process.env.WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE !== 'true' ||
      !/[/]wfm_ci(?:[?]|$)/.test(url)) throw new Error('isolated synthetic CI database required');
  const options = { datasources: { db: { url } } };
  const db = new PrismaClient(options);
  const recovered = new PrismaClient(options);
  const gate = new IntegrationSharedGatewayService(db as any);
  const requestId = 'phase5e2aq-kill-' + randomUUID();
  let child: ReturnType<typeof spawn> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const before = await gate.inspect();
    assert(before?.stopped);
    const generation = before.generation + 1n;
    assert.equal(await gate.fixtureRearm(generation), true);
    assert.equal(await gate.reserve(requestId, generation), 'RESERVED');
    child = spawn(process.execPath, ['-r', 'ts-node/register', '-e', `
      const { PrismaClient } = require('@prisma/client');
      const { IntegrationSyntheticSendGatewayService } = require('./src/integration/integration-synthetic-send-gateway.service');
      const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
      new IntegrationSyntheticSendGatewayService(db).dispatch(process.env.WFM_KILL_REQUEST,
        BigInt(process.env.WFM_KILL_GENERATION), async () => {
          process.stdout.write('SYNTHETIC_CALLBACK_ENTERED\\n');
          await new Promise(resolve => setInterval(() => {}, 1000));
        }).then(result => { console.error(result); process.exit(1); })
          .catch(() => process.exit(1));
    `], {
      cwd: process.cwd(),
      env: { ...process.env, WFM_KILL_REQUEST: requestId, WFM_KILL_GENERATION: String(generation) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const exited = once(child, 'exit');
    await new Promise<void>((resolve, reject) => {
      deadline = setTimeout(() => reject(new Error('synthetic callback startup timed out')), 15000);
      child!.once('error', reject);
      child!.once('exit', () => reject(new Error('child exited before callback')));
      child!.stdout!.on('data', chunk => {
        output += chunk.toString();
        if (output.includes('SYNTHETIC_CALLBACK_ENTERED\n')) resolve();
      });
      child!.stderr!.resume();
    });
    clearTimeout(deadline);
    // Independent client observes the committed marker while callback holds the lock.
    const attempt = await recovered.integrationSharedGatewayAttempt.findUnique({ where: { requestId } });
    assert.equal(attempt?.status, 'UNKNOWN');
    assert.equal(child.kill('SIGKILL'), true);
    const [, signal] = await exited;
    assert.equal(signal, 'SIGKILL');
    const restartGate = new IntegrationSharedGatewayService(recovered as any);
    const stopped = await restartGate.stop(generation + 1n);
    assert.equal(stopped.admissionsClosed, true);
    assert.equal(stopped.externallyQuiescent, false);
    assert(stopped.unresolvedAttempts !== null && stopped.unresolvedAttempts >= 1);
    let callbacks = 0;
    const restartedSender = new IntegrationSyntheticSendGatewayService(recovered as any);
    assert.equal(await restartedSender.dispatch(requestId, generation, async () => { callbacks++; }),
      'ALREADY_ATTEMPTED');
    assert.equal(callbacks, 0);
    assert.equal(await restartGate.fixtureRearm(generation + 2n), false);
    assert.equal((await recovered.integrationSharedGatewayAttempt.findUnique({ where: { requestId } }))?.status,
      'UNKNOWN');
    console.log('PASS: SIGKILL at synthetic callback preserves committed UNKNOWN across clients');
    console.log('PASS: restarted sender cannot replay; STOP closes admission without claiming external quiescence');
    console.log('PASS: unresolved killed send blocks rearm');
  } finally {
    clearTimeout(deadline);
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGKILL');
      await exited;
    }
    // Exact isolated fixture only; never reconcile a real provider outcome by deletion.
    await db.integrationSharedGatewayAttempt.deleteMany({ where: { requestId } });
    await Promise.all([db.$disconnect(), recovered.$disconnect()]);
  }
}
main().catch(error => { console.error(error); process.exit(1); });
