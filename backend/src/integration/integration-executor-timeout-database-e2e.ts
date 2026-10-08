import { PrismaClient } from '@prisma/client';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const tag = `integration-executor-timeout-e2e-${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('\n=== PHASE 5B.6 EXECUTOR TIMEOUT / HUNG-ADAPTER DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);
  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];

  try {
    console.log('\n=== 1. COOPERATIVE HUNG ADAPTER IS ABORTED AT BOUNDARY ===');
    const target = `EXEC_TIMEOUT_${Date.now()}`;
    const executor = new IntegrationExecutorService();
    const worker = new IntegrationWorkerService(service, executor);
    let calls = 0;
    let aborts = 0;
    executor.registerAdapter(target, async (context) => {
      calls += 1;
      await new Promise<void>((resolve) => {
        if (context.signal?.aborted) { aborts += 1; resolve(); return; }
        context.signal?.addEventListener('abort', () => { aborts += 1; resolve(); }, { once: true });
      });
    });
    executor.allowTarget(target);
    executor.setExecutionEnabled(true);
    executor.setExecutionTimeoutMs(50);
    worker.registerExecutorHandler(target);

    const queued = await service.queueIntegrationJob(tag, target, { testTag: tag }, `${tag}-timeout`, 2);
    jobIds.push(queued.job.id);
    const now = new Date(Date.now() + 1000);
    const result = await worker.runOnce(now, 1000);
    ok('hung adapter attempt returns FAILED worker result', result.status === 'FAILED');
    ok('hung adapter was invoked exactly once', calls === 1);
    ok('timeout abort signal reached cooperative adapter', aborts === 1);
    ok('timed-out attempt is never reported as completed external action', result.externalActionsExecuted === false);
    const failed = await prisma.integrationJob.findUnique({ where: { id: queued.job.id } });
    ok('timed-out job returns durably to PENDING', failed?.status === 'PENDING');
    ok('timeout increments retry exactly once', failed?.retries === 1);
    ok('timeout releases durable ownership', failed?.claimToken === null && failed?.claimedAt === null);
    ok('timeout diagnostic is persisted', String(failed?.lastError || '').includes('timed out'));
    ok('timeout schedules future retry', !!failed?.nextAttemptAt && failed.nextAttemptAt.getTime() > now.getTime());

    console.log('\n=== 2. RETRY DELAY PREVENTS IMMEDIATE RE-EXECUTION ===');
    const early = await worker.runOnce(now, 1000);
    ok('worker remains idle before timed-out retry schedule', early.status === 'IDLE');
    ok('adapter is not re-invoked before retry schedule', calls === 1);

    console.log('\n=== 3. REPEATED TIMEOUT REACHES TERMINAL FAILED ===');
    const retryNow = new Date((failed!.nextAttemptAt as Date).getTime() + 1);
    const terminalResult = await worker.runOnce(retryNow, 1000);
    ok('second timeout returns FAILED worker result', terminalResult.status === 'FAILED');
    ok('second timeout invokes adapter exactly once more', calls === 2);
    ok('second timeout aborts cooperative adapter', aborts === 2);
    const terminal = await prisma.integrationJob.findUnique({ where: { id: queued.job.id } });
    ok('timeout retry ceiling persists terminal FAILED', terminal?.status === 'FAILED');
    ok('terminal timeout retry count matches ceiling', terminal?.retries === 2 && terminal?.maxRetries === 2);
    ok('terminal timeout persists failedAt', !!terminal?.failedAt);
    ok('terminal timeout releases ownership', terminal?.claimToken === null && terminal?.claimedAt === null);

    console.log('\n=== 4. TERMINAL TIMEOUT JOB CANNOT EXECUTE AGAIN ===');
    const afterTerminal = await worker.runOnce(new Date(retryNow.getTime() + 60_000), 1000);
    ok('terminal timeout job is no longer claimable', afterTerminal.status === 'IDLE');
    ok('terminal timeout job cannot invoke adapter again', calls === 2);

    console.log('\n=== 5. TIMEOUT CONFIGURATION FAILS CLOSED ===');
    const validationExecutor = new IntegrationExecutorService();
    let zeroRejected = false;
    let invalidRejected = false;
    try { validationExecutor.setExecutionTimeoutMs(0); } catch { zeroRejected = true; }
    try { validationExecutor.setExecutionTimeoutMs(Number.NaN); } catch { invalidRejected = true; }
    ok('zero timeout is rejected', zeroRejected);
    ok('non-finite timeout is rejected', invalidRejected);

    console.log('\n=== 6. EXTERNAL EXECUTION ACCOUNTING SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('queue discovery itself executes no external actions', discovery.externalActionsExecuted === false);
    ok('timed-out attempts never report successful external execution', result.externalActionsExecuted === false && terminalResult.externalActionsExecuted === false);

    console.log('\n=== PHASE 5B.6 EXECUTOR TIMEOUT / HUNG-ADAPTER DATABASE E2E PASSED ===');
  } finally {
    console.log('\n=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({ where: { sourceSystem: tag, id: { in: jobIds } } });
    ok('cleanup removed only tagged timeout fixtures', await prisma.integrationJob.count({ where: { sourceSystem: tag } }) === 0);
    ok('database queue row count returned to baseline', await prisma.integrationJob.count() === baselineCount);
    console.log('PASS: isolated Phase 5B.6 executor timeout fixtures removed.');
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
