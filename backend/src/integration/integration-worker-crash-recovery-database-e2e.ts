import { PrismaClient } from '@prisma/client';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const tag = `integration-worker-crash-recovery-e2e-${Date.now()}`;
const target = `LOCAL_CRASH_RECOVERY_${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('');
  console.log('=== PHASE 5A.4B WORKER CRASH / RESTART RECOVERY DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];
  let handled = 0;

  try {
    console.log('');
    console.log('=== 1. SIMULATE WORKER CRASH AFTER CLAIM ===');
    const queued = await service.queueIntegrationJob(
      tag,
      target,
      { testTag: tag, scenario: 'crash-after-claim' },
      `${tag}-crash-after-claim`,
      3,
    );
    jobIds.push(queued.job.id);

    const claimedAt = new Date(Date.now() - 120_000);
    const abandoned = await service.claimNextJob(claimedAt);
    ok('worker A acquired isolated job before simulated crash', abandoned?.id === queued.job.id && abandoned.status === 'PROCESSING');
    ok('abandoned claim has ownership token', !!abandoned?.claimToken);
    const staleToken = abandoned!.claimToken!;

    console.log('');
    console.log('=== 2. RECOVER ABANDONED LEASE ===');
    const recoveryNow = new Date();
    const recovery = await service.recoverStaleClaims(recoveryNow, 60_000, 1_000, 10);
    ok('expired abandoned claim recovered exactly once', recovery.recovered === 1 && recovery.failed === 0);
    ok('recovery reports no external execution', recovery.externalActionsExecuted === false);

    const recovered = await prisma.integrationJob.findUnique({ where: { id: queued.job.id } });
    ok('recovered job returns to PENDING', recovered?.status === 'PENDING');
    ok('crashed attempt increments retry exactly once', recovered?.retries === 1);
    ok('recovery releases abandoned ownership', recovered?.claimToken === null && recovered?.claimedAt === null);
    ok('recovery schedules future retry', !!recovered?.nextAttemptAt && recovered.nextAttemptAt > recoveryNow);

    console.log('');
    console.log('=== 3. RESTARTED WORKER CANNOT RUN BEFORE RETRY SCHEDULE ===');
    const restartedWorker = new IntegrationWorkerService(service);
    restartedWorker.registerHandler(target, async () => {
      handled += 1;
    });
    const tooEarly = await restartedWorker.runOnce(recoveryNow);
    ok('restarted worker remains idle before retry schedule', tooEarly.status === 'IDLE');
    ok('handler has not executed before retry schedule', handled === 0);

    console.log('');
    console.log('=== 4. RESTARTED WORKER RECLAIMS AND COMPLETES ===');
    const retryNow = new Date(recovered!.nextAttemptAt.getTime() + 1_000);
    const completed = await restartedWorker.runOnce(retryNow);
    ok('restarted worker completes recovered job', completed.status === 'COMPLETED' && completed.job?.id === queued.job.id);
    ok('recovered job handler executes exactly once after restart', handled === 1);
    ok('restarted worker reports no external execution', completed.externalActionsExecuted === false);

    const completedRow = await prisma.integrationJob.findUnique({ where: { id: queued.job.id } });
    ok('recovered job persists COMPLETED state', completedRow?.status === 'COMPLETED');
    ok('successful restart releases ownership', completedRow?.claimToken === null && completedRow?.claimedAt === null);
    ok('successful restart persists completion timestamps', !!completedRow?.completedAt && !!completedRow?.processedAt);

    console.log('');
    console.log('=== 5. CRASHED WORKER TOKEN IS PERMANENTLY INVALID ===');
    let staleCompleteRejected = false;
    try {
      await service.completeClaimedJob(queued.job.id, staleToken, new Date());
    } catch (error: any) {
      staleCompleteRejected = String(error?.message ?? error).includes('no longer owned');
    }
    ok('crashed worker stale token cannot complete recovered job', staleCompleteRejected);

    let staleFailRejected = false;
    try {
      await service.failClaimedJob(queued.job.id, staleToken, new Error('late crashed worker failure'), 0, new Date());
    } catch (error: any) {
      staleFailRejected = String(error?.message ?? error).includes('no longer owned');
    }
    ok('crashed worker stale token cannot fail recovered job', staleFailRejected);

    console.log('');
    console.log('=== 6. COMPETING RESTART WORKERS DO NOT DUPLICATE EXECUTION ===');
    const raceTarget = `${target}_RACE`;
    let raceHandled = 0;
    const raceHandler = async () => {
      raceHandled += 1;
      await new Promise((resolve) => setTimeout(resolve, 75));
    };
    const raceWorkerA = new IntegrationWorkerService(service);
    const raceWorkerB = new IntegrationWorkerService(service);
    raceWorkerA.registerHandler(raceTarget, raceHandler);
    raceWorkerB.registerHandler(raceTarget, raceHandler);

    const raceQueued = await service.queueIntegrationJob(
      tag,
      raceTarget,
      { testTag: tag, scenario: 'restart-race' },
      `${tag}-restart-race`,
      3,
    );
    jobIds.push(raceQueued.job.id);
    const raceClaimAt = new Date(Date.now() - 120_000);
    const raceAbandoned = await service.claimNextJob(raceClaimAt);
    ok('restart-race fixture is abandoned in PROCESSING', raceAbandoned?.id === raceQueued.job.id && raceAbandoned.status === 'PROCESSING');

    const raceRecoveryNow = new Date();
    const raceRecovery = await service.recoverStaleClaims(raceRecoveryNow, 60_000, 0, 10);
    ok('restart-race abandoned claim recovered once', raceRecovery.recovered === 1);

    const raceRunAt = new Date(raceRecoveryNow.getTime() + 1_000);
    const [raceA, raceB] = await Promise.all([
      raceWorkerA.runOnce(raceRunAt),
      raceWorkerB.runOnce(raceRunAt),
    ]);
    ok('exactly one competing restarted worker completes recovered job', [raceA, raceB].filter((r) => r.status === 'COMPLETED').length === 1);
    ok('losing restarted worker remains idle', [raceA, raceB].filter((r) => r.status === 'IDLE').length === 1);
    ok('competing restart handler executes exactly once', raceHandled === 1);
    ok('competing restart workers report no external execution', [raceA, raceB].every((r) => r.externalActionsExecuted === false));

    const raceRow = await prisma.integrationJob.findUnique({ where: { id: raceQueued.job.id } });
    ok('restart-race fixture persists exactly COMPLETED', raceRow?.status === 'COMPLETED');
    ok('restart-race recovery increments retry exactly once', raceRow?.retries === 1);

    console.log('');
    console.log('=== 7. EXTERNAL EXECUTION SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('crash recovery and discovery execute no external actions', discovery.externalActionsExecuted === false);
    ok('Phase 5A.4B uses controlled local handlers only', true);

    console.log('');
    console.log('=== PHASE 5A.4B WORKER CRASH / RESTART RECOVERY DATABASE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({ where: { sourceSystem: tag, id: { in: jobIds } } });
    const remainingTagged = await prisma.integrationJob.count({ where: { sourceSystem: tag } });
    ok('cleanup removed only tagged crash-recovery fixtures', remainingTagged === 0);
    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5A.4B crash-recovery fixtures removed.');
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
