import { PrismaClient } from '@prisma/client';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const tag = `integration-classification-retry-e2e-${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function classifiedWorker(
  target: string,
  adapter: Parameters<IntegrationExecutorService['registerAdapter']>[1],
) {
  const executor = new IntegrationExecutorService();
  const worker = new IntegrationWorkerService(service, executor);
  executor.registerAdapter(target, adapter);
  executor.allowTarget(target);
  executor.setExecutionEnabled(true);
  worker.registerExecutorHandler(target);
  return worker;
}

async function main() {
  console.log('\n=== PHASE 5C.7 CLASSIFICATION-AWARE DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];

  try {
    console.log('\n=== 1. PERMANENT REJECTION FAILS TERMINALLY ON FIRST ATTEMPT ===');
    const permanentTarget = `CLASSIFY_PERMANENT_${Date.now()}`;
    let permanentCalls = 0;
    const permanentWorker = classifiedWorker(permanentTarget, async () => {
      permanentCalls += 1;
      return { status: 'REJECTED', message: 'database permanent provider rejection' };
    });
    const permanent = await service.queueIntegrationJob(
      tag, permanentTarget, { testTag: tag, scenario: 'permanent' },
      `${tag}-permanent`, 5,
    );
    jobIds.push(permanent.job.id);
    const permanentNow = new Date(Date.now() + 1000);
    const permanentResult = await permanentWorker.runOnce(permanentNow, 30_000);
    ok('PERMANENT rejection returns FAILED worker result', permanentResult.status === 'FAILED');
    ok('PERMANENT adapter executes exactly once', permanentCalls === 1);
    ok('PERMANENT rejection reports no completed external action', permanentResult.externalActionsExecuted === false);
    const permanentRow = await prisma.integrationJob.findUnique({ where: { id: permanent.job.id } });
    ok('PERMANENT rejection persists terminal FAILED immediately', permanentRow?.status === 'FAILED');
    ok('PERMANENT rejection consumes one attempt without exhausting maxRetries', permanentRow?.retries === 1 && permanentRow?.maxRetries === 5);
    ok('PERMANENT rejection records failedAt', !!permanentRow?.failedAt);
    ok('PERMANENT rejection releases ownership', permanentRow?.claimToken === null && permanentRow?.claimedAt === null);
    ok('PERMANENT diagnostic is persisted', permanentRow?.lastError === 'database permanent provider rejection');
    const permanentAgain = await permanentWorker.runOnce(new Date(permanentNow.getTime() + 60_000), 30_000);
    ok('PERMANENT terminal job cannot be reclaimed', permanentAgain.status === 'IDLE');
    ok('PERMANENT terminal job cannot execute adapter again', permanentCalls === 1);

    console.log('\n=== 2. INVALID RESPONSE FAILS TERMINALLY ON FIRST ATTEMPT ===');
    const invalidTarget = `CLASSIFY_INVALID_${Date.now()}`;
    let invalidCalls = 0;
    const invalidWorker = classifiedWorker(invalidTarget, async () => {
      invalidCalls += 1;
      return { status: 'BOGUS' } as any;
    });
    const invalid = await service.queueIntegrationJob(
      tag, invalidTarget, { testTag: tag, scenario: 'invalid-response' },
      `${tag}-invalid`, 5,
    );
    jobIds.push(invalid.job.id);
    const invalidNow = new Date(Date.now() + 2000);
    const invalidResult = await invalidWorker.runOnce(invalidNow, 30_000);
    ok('INVALID_RESPONSE returns FAILED worker result', invalidResult.status === 'FAILED');
    ok('INVALID_RESPONSE adapter executes exactly once', invalidCalls === 1);
    ok('INVALID_RESPONSE reports no completed external action', invalidResult.externalActionsExecuted === false);
    const invalidRow = await prisma.integrationJob.findUnique({ where: { id: invalid.job.id } });
    ok('INVALID_RESPONSE persists terminal FAILED immediately', invalidRow?.status === 'FAILED');
    ok('INVALID_RESPONSE consumes one attempt without exhausting maxRetries', invalidRow?.retries === 1 && invalidRow?.maxRetries === 5);
    ok('INVALID_RESPONSE records failedAt', !!invalidRow?.failedAt);
    ok('INVALID_RESPONSE releases ownership', invalidRow?.claimToken === null && invalidRow?.claimedAt === null);
    ok('INVALID_RESPONSE diagnostic is persisted', String(invalidRow?.lastError || '').includes('returned an invalid response'));
    const invalidAgain = await invalidWorker.runOnce(new Date(invalidNow.getTime() + 60_000), 30_000);
    ok('INVALID_RESPONSE terminal job cannot be reclaimed', invalidAgain.status === 'IDLE');
    ok('INVALID_RESPONSE terminal job cannot execute adapter again', invalidCalls === 1);

    console.log('\n=== 3. TRANSIENT FAILURE REMAINS DURABLY RETRYABLE ===');
    const transientTarget = `CLASSIFY_TRANSIENT_${Date.now()}`;
    let transientCalls = 0;
    const transientWorker = classifiedWorker(transientTarget, async () => {
      transientCalls += 1;
      return { status: 'RETRYABLE_FAILURE', message: 'database temporary provider failure' };
    });
    const transient = await service.queueIntegrationJob(
      tag, transientTarget, { testTag: tag, scenario: 'transient' },
      `${tag}-transient`, 5,
    );
    jobIds.push(transient.job.id);
    const transientNow = new Date(Date.now() + 3000);
    const transientResult = await transientWorker.runOnce(transientNow, 30_000);
    ok('TRANSIENT failure returns FAILED worker result', transientResult.status === 'FAILED');
    ok('TRANSIENT adapter executes exactly once', transientCalls === 1);
    ok('TRANSIENT failure reports no completed external action', transientResult.externalActionsExecuted === false);
    const transientRow = await prisma.integrationJob.findUnique({ where: { id: transient.job.id } });
    ok('TRANSIENT failure returns durable job to PENDING', transientRow?.status === 'PENDING');
    ok('TRANSIENT failure increments retry exactly once', transientRow?.retries === 1);
    ok('TRANSIENT failure does not record terminal failedAt', transientRow?.failedAt === null);
    ok('TRANSIENT failure releases ownership', transientRow?.claimToken === null && transientRow?.claimedAt === null);
    ok('TRANSIENT diagnostic is persisted', transientRow?.lastError === 'database temporary provider failure');
    ok('TRANSIENT failure schedules future retry', !!transientRow?.nextAttemptAt && transientRow.nextAttemptAt.getTime() > transientNow.getTime());
    const transientEarly = await transientWorker.runOnce(transientNow, 30_000);
    ok('TRANSIENT retry schedule prevents early reclaim', transientEarly.status === 'IDLE');
    ok('TRANSIENT adapter is not re-executed before schedule', transientCalls === 1);

    console.log('\n=== 4. DATABASE CLASSIFICATION SAFETY ===');
    const terminalClaim = await service.claimNextJob(new Date(Date.now() + 120_000));
    ok('terminal classified rows remain outside claimable queue', terminalClaim?.id !== permanent.job.id && terminalClaim?.id !== invalid.job.id);
    const discovery = await service.processPendingJobs();
    ok('queue discovery executes no external actions', discovery.externalActionsExecuted === false);

    console.log('\n=== PHASE 5C.7 CLASSIFICATION-AWARE DATABASE E2E PASSED ===');
  } finally {
    console.log('\n=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({ where: { sourceSystem: tag, id: { in: jobIds } } });
    ok('cleanup removed only tagged classification fixtures', await prisma.integrationJob.count({ where: { sourceSystem: tag } }) === 0);
    ok('database queue row count returned to baseline', await prisma.integrationJob.count() === baselineCount);
    console.log('PASS: isolated Phase 5C.7 classification fixtures removed.');
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
