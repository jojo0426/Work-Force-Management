import { PrismaClient } from '@prisma/client';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const tag = `integration-executor-retry-exhaustion-e2e-${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function failingWorker(target: string, calls: string[]) {
  const executor = new IntegrationExecutorService();
  const worker = new IntegrationWorkerService(service, executor);
  worker.registerExecutorHandler(target);
  executor.registerAdapter(target, async (context) => {
    calls.push(context.jobId);
    throw new Error('controlled persistent adapter failure');
  });
  executor.allowTarget(target);
  executor.setExecutionEnabled(true);
  return worker;
}

async function main() {
  console.log('');
  console.log('=== PHASE 5B.5 EXECUTOR FAILURE / RETRY-EXHAUSTION DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];

  try {
    console.log('');
    console.log('=== 1. PERSISTENT ADAPTER FAILURE REMAINS DURABLE AND RETRYABLE ===');
    const target = `EXEC_RETRY_EXHAUST_${Date.now()}`;
    const calls: string[] = [];
    const worker = failingWorker(target, calls);
    const queued = await service.queueIntegrationJob(
      tag,
      target,
      { testTag: tag, scenario: 'persistent-failure' },
      `${tag}-persistent-failure`,
      2,
    );
    jobIds.push(queued.job.id);

    const firstNow = new Date(Date.now() + 1000);
    const first = await worker.runOnce(firstNow, 1000);
    ok('first adapter failure returns FAILED worker result', first.status === 'FAILED');
    ok('first adapter attempt executes exactly once', calls.length === 1);
    ok('failed adapter attempt is not reported as completed external action', first.externalActionsExecuted === false);
    const afterFirst = await prisma.integrationJob.findUnique({ where: { id: queued.job.id } });
    ok('first failure returns durable job to PENDING', afterFirst?.status === 'PENDING');
    ok('first failure increments retry exactly once', afterFirst?.retries === 1);
    ok('first failure releases ownership', afterFirst?.claimToken === null && afterFirst?.claimedAt === null);
    ok('first failure persists controlled adapter error', String(afterFirst?.lastError || '').includes('controlled persistent adapter failure'));
    ok('first failure schedules future retry', !!afterFirst?.nextAttemptAt && afterFirst.nextAttemptAt.getTime() > firstNow.getTime());

    console.log('');
    console.log('=== 2. RETRY SCHEDULE PREVENTS EARLY RE-EXECUTION ===');
    const early = await worker.runOnce(firstNow, 1000);
    ok('worker remains idle before retry schedule', early.status === 'IDLE');
    ok('adapter is not invoked before retry schedule', calls.length === 1);

    console.log('');
    console.log('=== 3. RETRY CEILING TRANSITIONS JOB TO TERMINAL FAILED ===');
    const retryNow = new Date((afterFirst!.nextAttemptAt as Date).getTime() + 1);
    const second = await worker.runOnce(retryNow, 1000);
    ok('second adapter failure returns FAILED worker result', second.status === 'FAILED');
    ok('second and final adapter attempt executes exactly once', calls.length === 2);
    ok('terminal adapter failure is not reported as completed external action', second.externalActionsExecuted === false);
    const terminal = await prisma.integrationJob.findUnique({ where: { id: queued.job.id } });
    ok('retry ceiling persists terminal FAILED state', terminal?.status === 'FAILED');
    ok('retry ceiling persists exact retry count', terminal?.retries === 2 && terminal?.maxRetries === 2);
    ok('terminal failure persists failedAt', !!terminal?.failedAt);
    ok('terminal failure releases ownership', terminal?.claimToken === null && terminal?.claimedAt === null);
    ok('terminal failure retains controlled diagnostic error', String(terminal?.lastError || '').includes('controlled persistent adapter failure'));

    console.log('');
    console.log('=== 4. TERMINAL FAILED JOB CANNOT EXECUTE AGAIN ===');
    const afterTerminal = await worker.runOnce(new Date(retryNow.getTime() + 60_000), 1000);
    ok('terminal failed job is no longer claimable', afterTerminal.status === 'IDLE');
    ok('terminal failed job cannot invoke adapter again', calls.length === 2);

    console.log('');
    console.log('=== 5. STALE OWNERSHIP CANNOT RESURRECT TERMINAL JOB ===');
    const terminalClaim = await service.claimNextJob(new Date(retryNow.getTime() + 120_000));
    ok('queue claim ignores terminal failed job', terminalClaim === null);
    const persisted = await prisma.integrationJob.findUnique({ where: { id: queued.job.id } });
    ok('terminal failed state remains durable', persisted?.status === 'FAILED' && persisted?.retries === 2);

    console.log('');
    console.log('=== 6. EXTERNAL EXECUTION ACCOUNTING SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('queue discovery itself executes no external actions', discovery.externalActionsExecuted === false);
    ok('all adapter attempts belong only to controlled tagged fixture', calls.every((id) => id === queued.job.id));
    ok('persistent failures never report completed external execution', first.externalActionsExecuted === false && second.externalActionsExecuted === false);

    console.log('');
    console.log('=== PHASE 5B.5 EXECUTOR FAILURE / RETRY-EXHAUSTION DATABASE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({ where: { sourceSystem: tag, id: { in: jobIds } } });
    const remainingTagged = await prisma.integrationJob.count({ where: { sourceSystem: tag } });
    ok('cleanup removed only tagged executor retry fixtures', remainingTagged === 0);
    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5B.5 executor retry fixtures removed.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
