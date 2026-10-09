import { strict as assert } from 'assert';
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import { once } from 'events';
import { IntegrationSharedGatewayService } from './integration-shared-gateway.service';

async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.WFM_SHARED_GATEWAY_FIXTURE !== 'true' ||
      !new RegExp('[/]wfm_ci(?:[?]|$)').test(process.env.DATABASE_URL || '')) {
    throw new Error('isolated PostgreSQL fixture required');
  }
  const db = new PrismaClient();
  const gate = new IntegrationSharedGatewayService(db as any);
  const requestId = 'phase5e2ao-kill-' + Date.now();
  const childCode = `
    const { PrismaClient } = require('@prisma/client');
    (async () => {
      const db = new PrismaClient();
      const row = await db.integrationSharedGatewayControl.findUnique({
        where: { id: 'GLOBAL' }
      });
      await db.integrationSharedGatewayAttempt.create({
        data: { requestId: process.env.WFM_GATE_REQUEST,
          generation: row.generation, status: 'RESERVED' }
      });
      process.stdout.write('RESERVED\\n');
      setInterval(() => {}, 1000);
    })().catch(e => { console.error(e); process.exit(1); });
  `;
  const child = spawn(process.execPath, ['-e', childCode], {
    cwd: process.cwd(),
    env: { ...process.env, WFM_GATE_REQUEST: requestId },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { errors += chunk.toString(); });
  try {
    const ready = await Promise.race([
      new Promise<boolean>(resolve => {
        child.stdout.on('data', () => { if (output.includes('RESERVED')) resolve(true); });
        child.on('exit', () => resolve(false));
      }),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 15000)),
    ]);
    if (!ready) throw new Error('child failed: ' + errors.slice(0, 250));
    child.kill('SIGKILL');
    const [, signal] = await once(child, 'exit') as [number | null, string | null];
    assert.equal(signal, 'SIGKILL');
    const control = await gate.inspect();
    assert(control);
    const stopped = await gate.stop(control.generation + 1n);
    assert.equal(stopped.admissionsClosed, true);
    assert.equal(stopped.externallyQuiescent, false);
    assert(stopped.unresolvedAttempts >= 1);
    assert.equal(await gate.markUnknown(requestId), true);
    assert.equal(await gate.fixtureRearm(control.generation + 2n), false);
    const attempt = await db.integrationSharedGatewayAttempt.findUnique({
      where: { requestId },
    });
    assert.equal(attempt?.status, 'UNKNOWN');
    console.log('PASS: SIGKILL preserves shared gateway reservation across processes');
    console.log('PASS: STOP leaves unknown external outcome and denies rearm');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
