import { PrismaClient } from '@prisma/client';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const tag = `integration-executor-concurrency-e2e-${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function controlledWorker(target: string, calls: string[]) {
  const executor = new IntegrationExecutorService();
  const worker = new IntegrationWorkerService(service, executor);
  worker.registerExecutorHandler(target);
  executor.registerAdapter(target, async (context) => {
    calls.push(context.jobId);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  executor.allowTarget(target);
  executor.setExecutionEnabled(true);
  return worker;
}

async function main() {
  console.log('');
  console.log('=== PHASE 5B.4 EXECUTOR CONCURRENCY / DUPLICATE-EXECUTION DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];

  try {
    console.log('');
    console.log('=== 1. SAME JOB / COMPETING EXECUTOR WORKERS ===');
    const target = `EXEC_RACE_${Date.now()}`;
    const calls: string[] = [];
    const workerA = controlledWorker(target, calls);
    const workerB = controlledWorker(target, calls);
    const queued = await service.queueIntegrationJob(tag, target, { testTag: tag, scenario: 'single-race' }, `${tag}-single`, 3);
    jobIds.push(queued.job.id);

    const now = new Date(Date.now() + 1000);
    const [a, b] = await Promise.all([workerA.runOnce(now), workerB.runOnce(now)]);
    const completed = [a, b].filter((r) => r.status === 'COMPLETED');
    const idle = [a, b].filter((r) => r.status === 'IDLE');
    ok('exactly one competing executor worker completes single job', completed.length === 1);
    ok('losing competing executor worker remains idle', idle.length === 1);
    ok('controlled adapter executes single raced job exactly once', calls.filter((id) => id === queued.job.id).length === 1);
    ok('only winning worker reports external execution', [a, b].filter((r) => r.externalActionsExecuted === true).length === 1);
    const row = await prisma.integrationJob.findUnique({ where: { id: queued.job.id } });
    ok('single raced executor job persists COMPLETED', row?.status === 'COMPLETED');
    ok('single raced executor job releases ownership', row?.claimToken === null && row?.claimedAt === null);

    console.log('');
    console.log('=== 2. TWO JOBS / TWO EXECUTOR WORKERS ===');
    const target2 = `EXEC_PARALLEL_${Date.now()}`;
    const calls2: string[] = [];
    const workerC = controlledWorker(target2, calls2);
    const workerD = controlledWorker(target2, calls2);
    const q1 = await service.queueIntegrationJob(tag, target2, { testTag: tag, scenario: 'parallel-1' }, `${tag}-parallel-1`, 3);
    const q2 = await service.queueIntegrationJob(tag, target2, { testTag: tag, scenario: 'parallel-2' }, `${tag}-parallel-2`, 3);
    jobIds.push(q1.job.id, q2.job.id);
    const [c, d] = await Promise.all([workerC.runOnce(new Date(Date.now() + 2000)), workerD.runOnce(new Date(Date.now() + 2000))]);
    ok('two eligible executor jobs are both completed', c.status === 'COMPLETED' && d.status === 'COMPLETED');
    ok('parallel executor workers claim different durable jobs', c.job?.id !== d.job?.id);
    ok('each parallel durable job invokes adapter exactly once', calls2.filter((id) => id === q1.job.id).length === 1 && calls2.filter((id) => id === q2.job.id).length === 1);
    ok('both successful executor workers report external execution', c.externalActionsExecuted === true && d.externalActionsExecuted === true);

    console.log('');
    console.log('=== 3. IDEMPOTENT ENQUEUE DOES NOT CREATE DUPLICATE EXTERNAL EXECUTION ===');
    const target3 = `EXEC_IDEMPOTENT_${Date.now()}`;
    const calls3: string[] = [];
    const workerE = controlledWorker(target3, calls3);
    const first = await service.queueIntegrationJob(tag, target3, { testTag: tag, scenario: 'idempotent' }, `${tag}-same-event`, 3);
    const duplicate = await service.queueIntegrationJob(tag, target3, { testTag: tag, scenario: 'idempotent-duplicate' }, `${tag}-same-event`, 3);
    jobIds.push(first.job.id);
    ok('same source/idempotency key resolves to one durable job', first.job.id === duplicate.job.id && duplicate.idempotent === true);
    const e = await workerE.runOnce(new Date(Date.now() + 3000));
    ok('idempotent durable job completes', e.status === 'COMPLETED');
    ok('idempotent enqueue results in exactly one adapter execution', calls3.length === 1 && calls3[0] === first.job.id);
    const after = await workerE.runOnce(new Date(Date.now() + 3000));
    ok('completed idempotent job cannot execute again', after.status === 'IDLE' && calls3.length === 1);

    console.log('');
    console.log('=== 4. EXTERNAL EXECUTION ACCOUNTING SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('queue discovery itself executes no external actions', discovery.externalActionsExecuted === false);
    ok('all adapter calls correspond only to controlled tagged fixtures', [...calls, ...calls2, ...calls3].every((id) => jobIds.includes(id)));

    console.log('');
    console.log('=== PHASE 5B.4 EXECUTOR CONCURRENCY / DUPLICATE-EXECUTION DATABASE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({ where: { sourceSystem: tag, id: { in: jobIds } } });
    const remainingTagged = await prisma.integrationJob.count({ where: { sourceSystem: tag } });
    ok('cleanup removed only tagged executor concurrency fixtures', remainingTagged === 0);
    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5B.4 executor concurrency fixtures removed.');
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
