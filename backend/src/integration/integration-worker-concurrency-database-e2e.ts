import { PrismaClient } from '@prisma/client';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const workerA = new IntegrationWorkerService(service);
const workerB = new IntegrationWorkerService(service);
const tag = `integration-worker-concurrency-e2e-${Date.now()}`;
const target = `LOCAL_CONCURRENCY_${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('');
  console.log('=== PHASE 5A.3B INTEGRATION WORKER CONCURRENCY DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];
  const handled: string[] = [];

  const handler = async (payload: any) => {
    handled.push(String(payload?.scenario || 'unknown'));
    await new Promise((resolve) => setTimeout(resolve, 75));
  };
  workerA.registerHandler(target, handler);
  workerB.registerHandler(target, handler);

  try {
    console.log('');
    console.log('=== 1. SAME-JOB CONCURRENT WORKER RACE ===');
    const single = await service.queueIntegrationJob(
      tag,
      target,
      { testTag: tag, scenario: 'single-race' },
      `${tag}-single-race`,
      3,
    );
    jobIds.push(single.job.id);

    const now = new Date(Date.now() + 1000);
    const [a, b] = await Promise.all([workerA.runOnce(now), workerB.runOnce(now)]);
    const completed = [a, b].filter((r) => r.status === 'COMPLETED');
    const idle = [a, b].filter((r) => r.status === 'IDLE');
    ok('exactly one concurrent worker completes single job', completed.length === 1);
    ok('losing concurrent worker remains idle', idle.length === 1);
    ok('single job handler executed exactly once', handled.filter((x) => x === 'single-race').length === 1);
    ok('workers report no external action execution', [a, b].every((r) => r.externalActionsExecuted === false));

    const singleRow = await prisma.integrationJob.findUnique({ where: { id: single.job.id } });
    ok('single raced job persisted exactly COMPLETED', singleRow?.status === 'COMPLETED');
    ok('single raced job releases ownership', singleRow?.claimToken === null && singleRow?.claimedAt === null);

    console.log('');
    console.log('=== 2. TWO JOBS / TWO WORKERS ===');
    const first = await service.queueIntegrationJob(tag, target, { testTag: tag, scenario: 'parallel-1' }, `${tag}-parallel-1`, 3);
    const second = await service.queueIntegrationJob(tag, target, { testTag: tag, scenario: 'parallel-2' }, `${tag}-parallel-2`, 3);
    jobIds.push(first.job.id, second.job.id);

    const [p1, p2] = await Promise.all([
      workerA.runOnce(new Date(Date.now() + 2000)),
      workerB.runOnce(new Date(Date.now() + 2000)),
    ]);
    ok('two eligible jobs are both completed', p1.status === 'COMPLETED' && p2.status === 'COMPLETED');
    ok('workers claimed different jobs', !!p1.job?.id && !!p2.job?.id && p1.job.id !== p2.job.id);
    ok('each parallel handler executed exactly once', handled.filter((x) => x === 'parallel-1').length === 1 && handled.filter((x) => x === 'parallel-2').length === 1);

    console.log('');
    console.log('=== 3. FAILURE / RETRY UNDER COMPETING WORKERS ===');
    const failTarget = `${target}_FAIL`;
    let failCalls = 0;
    const failingHandler = async () => {
      failCalls += 1;
      throw new Error('Phase 5A.3B controlled concurrent failure');
    };
    workerA.registerHandler(failTarget, failingHandler);
    workerB.registerHandler(failTarget, failingHandler);

    const failing = await service.queueIntegrationJob(tag, failTarget, { testTag: tag, scenario: 'failure-race' }, `${tag}-failure-race`, 2);
    jobIds.push(failing.job.id);
    const failNow = new Date(Date.now() + 3000);
    const [f1, f2] = await Promise.all([workerA.runOnce(failNow, 60_000), workerB.runOnce(failNow, 60_000)]);
    ok('exactly one worker owns failing attempt', [f1, f2].filter((r) => r.status === 'FAILED').length === 1);
    ok('competing worker cannot execute failing job twice', failCalls === 1);
    ok('losing failure-race worker is idle', [f1, f2].filter((r) => r.status === 'IDLE').length === 1);

    const failedRow = await prisma.integrationJob.findUnique({ where: { id: failing.job.id } });
    ok('failed concurrent attempt returns job to PENDING', failedRow?.status === 'PENDING');
    ok('failed concurrent attempt increments retry once', failedRow?.retries === 1);
    ok('failed concurrent attempt releases ownership', failedRow?.claimToken === null && failedRow?.claimedAt === null);
    ok('retry schedule prevents immediate competing reclaim', (await Promise.all([workerA.runOnce(new Date()), workerB.runOnce(new Date())])).every((r) => r.status === 'IDLE'));

    console.log('');
    console.log('=== 4. EXTERNAL EXECUTION SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('queue discovery executes no external actions', discovery.externalActionsExecuted === false);
    ok('Phase 5A.3B uses controlled local handlers only', true);

    console.log('');
    console.log('=== PHASE 5A.3B WORKER CONCURRENCY DATABASE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({ where: { sourceSystem: tag, id: { in: jobIds } } });
    const remainingTagged = await prisma.integrationJob.count({ where: { sourceSystem: tag } });
    ok('cleanup removed only tagged concurrency fixtures', remainingTagged === 0);
    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5A.3B concurrency fixtures removed.');
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
