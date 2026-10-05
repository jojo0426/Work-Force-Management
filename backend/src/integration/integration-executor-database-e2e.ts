import { PrismaClient } from '@prisma/client';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const tag = `integration-executor-e2e-${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('');
  console.log('=== PHASE 5B.3 CONTROLLED EXECUTOR DATABASE LIFECYCLE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];
  const adapterCalls: any[] = [];

  try {
    console.log('');
    console.log('=== 1. DISABLED EXECUTOR FAILS CLOSED DURABLY ===');
    const disabledTarget = `EXEC_DISABLED_${Date.now()}`;
    const disabledExecutor = new IntegrationExecutorService();
    const disabledWorker = new IntegrationWorkerService(service, disabledExecutor);
    disabledWorker.registerExecutorHandler(disabledTarget);
    disabledExecutor.registerAdapter(disabledTarget, async (context) => { adapterCalls.push(context); });
    disabledExecutor.allowTarget(disabledTarget);

    const disabled = await service.queueIntegrationJob(tag, disabledTarget, { testTag: tag, scenario: 'disabled' }, `${tag}-disabled`, 3);
    jobIds.push(disabled.job.id);
    const disabledResult = await disabledWorker.runOnce(new Date(Date.now() + 1000), 60_000);
    ok('disabled executor claims isolated database fixture', disabledResult.job?.id === disabled.job.id);
    ok('disabled executor invokes no adapter', adapterCalls.length === 0);
    ok('disabled executor reports no external action execution', disabledResult.externalActionsExecuted === false);
    const disabledRow = await prisma.integrationJob.findUnique({ where: { id: disabled.job.id } });
    ok('disabled executor returns fixture to PENDING', disabledRow?.status === 'PENDING');
    ok('disabled executor increments retry once', disabledRow?.retries === 1);
    ok('disabled executor releases ownership', disabledRow?.claimToken === null && disabledRow?.claimedAt === null);
    ok('disabled executor persists explicit boundary reason', String(disabledRow?.lastError || '').includes('EXECUTION_DISABLED'));

    console.log('');
    console.log('=== 2. ENABLED ALLOW-LISTED EXECUTOR COMPLETES DURABLY ===');
    const successTarget = `EXEC_SUCCESS_${Date.now()}`;
    const successExecutor = new IntegrationExecutorService();
    const successWorker = new IntegrationWorkerService(service, successExecutor);
    successWorker.registerExecutorHandler(successTarget);
    successExecutor.registerAdapter(successTarget, async (context) => { adapterCalls.push(context); });
    successExecutor.allowTarget(successTarget);
    successExecutor.setExecutionEnabled(true);

    const success = await service.queueIntegrationJob(tag, successTarget, { testTag: tag, scenario: 'success' }, `${tag}-success`, 3);
    jobIds.push(success.job.id);
    const successResult = await successWorker.runOnce(new Date(Date.now() + 2000));
    ok('enabled executor claims isolated database fixture', successResult.job?.id === success.job.id);
    ok('enabled executor invokes controlled adapter exactly once', adapterCalls.length === 1);
    ok('adapter receives durable job identity', adapterCalls[0]?.jobId === success.job.id);
    ok('adapter receives durable source identity', adapterCalls[0]?.sourceSystem === tag);
    ok('successful boundary explicitly reports external execution', successResult.externalActionsExecuted === true);
    const successRow = await prisma.integrationJob.findUnique({ where: { id: success.job.id } });
    ok('successful executor persists COMPLETED', successRow?.status === 'COMPLETED');
    ok('successful executor persists completion timestamps', !!successRow?.completedAt && !!successRow?.processedAt);
    ok('successful executor releases ownership', successRow?.claimToken === null && successRow?.claimedAt === null);

    console.log('');
    console.log('=== 3. NON-ALLOW-LISTED TARGET FAILS CLOSED DURABLY ===');
    const blockedTarget = `EXEC_BLOCKED_${Date.now()}`;
    const blockedExecutor = new IntegrationExecutorService();
    const blockedWorker = new IntegrationWorkerService(service, blockedExecutor);
    blockedWorker.registerExecutorHandler(blockedTarget);
    blockedExecutor.registerAdapter(blockedTarget, async () => { throw new Error('blocked adapter must not execute'); });
    blockedExecutor.setExecutionEnabled(true);

    const blocked = await service.queueIntegrationJob(tag, blockedTarget, { testTag: tag, scenario: 'blocked' }, `${tag}-blocked`, 3);
    jobIds.push(blocked.job.id);
    const blockedResult = await blockedWorker.runOnce(new Date(Date.now() + 3000), 60_000);
    ok('blocked executor claims isolated database fixture', blockedResult.job?.id === blocked.job.id);
    ok('blocked executor reports no external action execution', blockedResult.externalActionsExecuted === false);
    const blockedRow = await prisma.integrationJob.findUnique({ where: { id: blocked.job.id } });
    ok('blocked executor returns fixture to PENDING', blockedRow?.status === 'PENDING');
    ok('blocked executor increments retry once', blockedRow?.retries === 1);
    ok('blocked executor persists target reason', String(blockedRow?.lastError || '').includes('TARGET_NOT_ALLOWED'));

    console.log('');
    console.log('=== 4. ADAPTER FAILURE USES DURABLE RETRY ===');
    const failureTarget = `EXEC_FAIL_${Date.now()}`;
    const failureExecutor = new IntegrationExecutorService();
    const failureWorker = new IntegrationWorkerService(service, failureExecutor);
    failureWorker.registerExecutorHandler(failureTarget);
    failureExecutor.registerAdapter(failureTarget, async () => { throw new Error('Phase 5B.3 controlled adapter failure'); });
    failureExecutor.allowTarget(failureTarget);
    failureExecutor.setExecutionEnabled(true);

    const failure = await service.queueIntegrationJob(tag, failureTarget, { testTag: tag, scenario: 'failure' }, `${tag}-failure`, 2);
    jobIds.push(failure.job.id);
    const failureResult = await failureWorker.runOnce(new Date(Date.now() + 4000), 60_000);
    ok('failing executor claims isolated database fixture', failureResult.job?.id === failure.job.id);
    ok('adapter failure reports no completed external action', failureResult.externalActionsExecuted === false);
    const failureRow = await prisma.integrationJob.findUnique({ where: { id: failure.job.id } });
    ok('adapter failure returns fixture to PENDING', failureRow?.status === 'PENDING');
    ok('adapter failure increments retry once', failureRow?.retries === 1);
    ok('adapter failure releases ownership', failureRow?.claimToken === null && failureRow?.claimedAt === null);
    ok('adapter failure persists controlled error', failureRow?.lastError === 'Phase 5B.3 controlled adapter failure');

    console.log('');
    console.log('=== 5. EXTERNAL EXECUTION ACCOUNTING SAFETY ===');
    ok('only successful controlled boundary reports external execution', successResult.externalActionsExecuted === true && disabledResult.externalActionsExecuted === false && blockedResult.externalActionsExecuted === false && failureResult.externalActionsExecuted === false);
    const discovery = await service.processPendingJobs();
    ok('queue discovery itself executes no external actions', discovery.externalActionsExecuted === false);

    console.log('');
    console.log('=== PHASE 5B.3 CONTROLLED EXECUTOR DATABASE LIFECYCLE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({ where: { sourceSystem: tag, id: { in: jobIds } } });
    const remainingTagged = await prisma.integrationJob.count({ where: { sourceSystem: tag } });
    ok('cleanup removed only tagged executor fixtures', remainingTagged === 0);
    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5B.3 executor fixtures removed.');
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
