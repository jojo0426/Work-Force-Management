import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';
import { once } from 'events';
import { IntegrationTrustedWorkerService } from './integration-trusted-worker.service';

/**
 * Actual child-process SIGKILL with durable DB observation.
 * Does NOT establish provider-side request-start fencing.
 */
async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('Isolated CI PostgreSQL wfm_ci required');
  }
  const db = new PrismaClient();
  const workerId = 'phase5e2al-kill-' + Date.now();
  const childCode = `
    const { PrismaClient } = require('@prisma/client');
    (async () => {
      const db = new PrismaClient();
      await db.integrationWorkerMembership.create({
        data: { workerId: process.env.WFM_KILL_TEST_WORKER,
          instanceToken: 'f'.repeat(64), generation: 0n }
      });
      process.stdout.write('PERSISTED\\n');
      setInterval(() => {}, 1000);
    })().catch(e => { console.error(e); process.exit(1); });
  `;
  const child = spawn(process.execPath, ['-e', childCode], {
    cwd: process.cwd(),
    env: { ...process.env, WFM_KILL_TEST_WORKER: workerId },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    const ready = await Promise.race([
      new Promise<boolean>(resolve => {
        child.stdout.on('data', () => { if (output.includes('PERSISTED')) resolve(true); });
        child.on('exit', () => resolve(false));
      }),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 15000)),
    ]);
    if (!ready) throw new Error('child did not persist: ' + stderr.slice(0, 300));
    child.kill('SIGKILL');
    const [exitCode, signal] = await once(child, 'exit') as [number | null, string | null];
    if (signal !== 'SIGKILL' && exitCode !== null) throw new Error('child was not killed');
    const persisted = await db.integrationWorkerMembership.findUnique({ where: { workerId } });
    if (!persisted || persisted.instanceToken !== 'f'.repeat(64)) {
      throw new Error('durable membership missing after process crash');
    }
    const inspected = await new IntegrationTrustedWorkerService(db as any).inspect();
    if (inspected.externallyQuiescent !== false) {
      throw new Error('crash incorrectly inferred external quiescence');
    }
    console.log('PASS: actual child SIGKILL preserves durable membership');
    console.log('PASS: crash does not imply external provider quiescence');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await db.$disconnect();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
