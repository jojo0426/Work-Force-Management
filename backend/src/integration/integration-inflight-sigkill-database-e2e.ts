import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import { once } from 'events';

function assert(name: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      !new RegExp('[/]wfm_ci(?:[?]|$)').test(process.env.DATABASE_URL || '')) {
    throw new Error('Isolated CI PostgreSQL required');
  }
  const db = new PrismaClient();
  const workerId = 'phase5e2am-' + Date.now();
  const childCode = `
    const { PrismaClient } = require('@prisma/client');
    (async () => {
      const db = new PrismaClient();
      await db.integrationWorkerMembership.create({
        data: { workerId: process.env.WFM_TEST_WORKER,
          instanceToken: 'e'.repeat(64), generation: 0n, activeAttempts: 1 }
      });
      process.stdout.write('IN_FLIGHT_UNKNOWN\\n');
      setInterval(() => {}, 1000);
    })().catch(e => { console.error(e); process.exit(1); });
  `;
  const child = spawn(process.execPath, ['-e', childCode], {
    cwd: process.cwd(), env: { ...process.env, WFM_TEST_WORKER: workerId },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', stderr = '';
  child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
  child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
  try {
    const ready = await Promise.race([
      new Promise<boolean>(resolve => {
        child.stdout.on('data', () => { if (output.includes('IN_FLIGHT_UNKNOWN')) resolve(true); });
        child.on('exit', () => resolve(false));
      }),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 15000)),
    ]);
    if (!ready) throw new Error('child fixture failed: ' + stderr.slice(0, 250));
    child.kill('SIGKILL');
    const [, signal] = await once(child, 'exit') as [number | null, string | null];
    assert('replica A killed with SIGKILL', signal === 'SIGKILL');
    const member = await db.integrationWorkerMembership.findUnique({ where: { workerId } });
    assert('replica B sees unresolved active attempt after process death',
      member?.activeAttempts === 1);
    assert('crash cannot silently mark active attempt complete',
      member?.stopAckGeneration === null);
    console.log('Phase 5E.2AM in-flight crash ledger observation passed; no external I/O tested.');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
