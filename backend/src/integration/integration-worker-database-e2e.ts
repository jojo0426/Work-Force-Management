import { PrismaClient } from '@prisma/client';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const worker = new IntegrationWorkerService(service);
const tag = `integration-worker-e2e-${Date.now()}`;
const target = `LOCAL_${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('');
  console.log('=== PHASE 5A.3A INTEGRATION WORKER DATABASE LIFECYCLE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];
  const handled: unknown[] = [];

  worker.registerHandler(target, async (payload) => {
    handled.push(payload);
  });

  try {
    console.log('');
    console.log('=== 1. SUCCESSFUL CONTROLLED LOCAL HANDLER ===');
    const success = await service.queueIntegrationJob(
      tag,
      target,
      { testTag: tag, scenario: 'success' },
      `${tag}-success`,
      3,
    );
    jobIds.push(success.job.id);

    const completed = await worker.runOnce(new Date(Date.now() + 1000));
    ok('worker claimed isolated database fixture', completed.job?.id === success.job.id);
    ok('registered local handler executed exactly once', handled.length === 1);
    ok('worker completed successful fixture', completed.status === 'COMPLETED');
    ok('worker reports no external action execution', completed.externalActionsExecuted === false);

    const completedRow = await prisma.integrationJob.findUnique({ where: { id: success.job.id } });
    ok('COMPLETED state persisted in database', completedRow?.status === 'COMPLETED');
    ok('completion timestamps persisted', !!completedRow?.completedAt && !!completedRow?.processedAt);
    ok('successful completion releases ownership', completedRow?.claimToken === null && completedRow?.claimedAt === null);

    console.log('');
    console.log('=== 2. UNKNOWN TARGET FAILS CLOSED ===');
    const unknown = await service.queueIntegrationJob(
      tag,
      `${target}_UNKNOWN`,
      { testTag: tag, scenario: 'unknown-target' },
      `${tag}-unknown`,
      3,
    );
    jobIds.push(unknown.job.id);

    const unknownResult = await worker.runOnce(new Date(Date.now() + 2000), 60_000);
    ok('unknown target fixture was claimed', unknownResult.job?.id === unknown.job.id);
    ok('unknown target returns durable failure result', unknownResult.status === 'FAILED');
    ok('unknown target executes no registered handler', handled.length === 1);
    ok('unknown target reports no external action execution', unknownResult.externalActionsExecuted === false);

    const unknownRow = await prisma.integrationJob.findUnique({ where: { id: unknown.job.id } });
    ok('unknown target returned to PENDING', unknownRow?.status === 'PENDING');
    ok('unknown target increments retry count', unknownRow?.retries === 1);
    ok('unknown target releases ownership', unknownRow?.claimToken === null && unknownRow?.claimedAt === null);
    ok('unknown target persists fail-closed error', String(unknownRow?.lastError || '').includes('No controlled integration handler registered'));

    console.log('');
    console.log('=== 3. HANDLER FAILURE USES DURABLE RETRY ===');
    const failingTarget = `${target}_FAIL`;
    worker.registerHandler(failingTarget, async () => {
      throw new Error('Phase 5A.3A controlled handler failure');
    });

    const failing = await service.queueIntegrationJob(
      tag,
      failingTarget,
      { testTag: tag, scenario: 'handler-failure' },
      `${tag}-failure`,
      2,
    );
    jobIds.push(failing.job.id);

    const failedResult = await worker.runOnce(new Date(Date.now() + 3000), 60_000);
    ok('failing handler fixture was claimed', failedResult.job?.id === failing.job.id);
    ok('handler failure returns FAILED worker result', failedResult.status === 'FAILED');
    ok('handler failure reports no external action execution', failedResult.externalActionsExecuted === false);

    const failedRow = await prisma.integrationJob.findUnique({ where: { id: failing.job.id } });
    ok('handler failure returned fixture to PENDING', failedRow?.status === 'PENDING');
    ok('handler failure increments retry count', failedRow?.retries === 1);
    ok('handler failure persists controlled error', failedRow?.lastError === 'Phase 5A.3A controlled handler failure');
    ok('handler failure releases ownership', failedRow?.claimToken === null && failedRow?.claimedAt === null);

    console.log('');
    console.log('=== 4. EXTERNAL EXECUTION SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('queue discovery still executes no external actions', discovery.externalActionsExecuted === false);
    ok('worker lifecycle remains explicit runOnce only', typeof worker.runOnce === 'function');

    console.log('');
    console.log('=== PHASE 5A.3A WORKER DATABASE LIFECYCLE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({
      where: { sourceSystem: tag, id: { in: jobIds } },
    });

    const remainingTagged = await prisma.integrationJob.count({ where: { sourceSystem: tag } });
    ok('cleanup removed only tagged worker fixtures', remainingTagged === 0);

    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5A.3A worker fixtures removed.');
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
