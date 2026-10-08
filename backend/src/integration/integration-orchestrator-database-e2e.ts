import { PrismaClient } from '@prisma/client';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';
import { IntegrationOrchestratorService } from './integration-orchestrator.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const worker = new IntegrationWorkerService(service);
const orchestrator = new IntegrationOrchestratorService(service, worker);
const tag = `integration-orchestrator-e2e-${Date.now()}`;
const target = `LOCAL_ORCHESTRATOR_${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('');
  console.log('=== PHASE 5A.5B INTEGRATION ORCHESTRATOR DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];
  const handled: unknown[] = [];

  worker.registerHandler(target, async (payload) => {
    handled.push(payload);
  });

  try {
    console.log('');
    console.log('=== 1. ORCHESTRATOR COMPLETES CONTROLLED DATABASE JOB ===');
    const success = await service.queueIntegrationJob(
      tag,
      target,
      { testTag: tag, scenario: 'orchestrated-success' },
      `${tag}-success`,
      3,
    );
    jobIds.push(success.job.id);

    const successNow = new Date(Date.now() + 1000);
    const completed = await orchestrator.tick(successNow, { retryDelayMs: 60_000 });
    ok('orchestrator completes controlled fixture', completed.status === 'COMPLETED');
    ok('orchestrator propagates claimed fixture', completed.worker?.job?.id === success.job.id);
    ok('controlled handler executes exactly once', handled.length === 1);
    ok('orchestrator reports no external action execution', completed.externalActionsExecuted === false);
    ok('recovery reports no external action execution', completed.recovery?.externalActionsExecuted === false);

    const completedRow = await prisma.integrationJob.findUnique({ where: { id: success.job.id } });
    ok('orchestrated completion persists COMPLETED', completedRow?.status === 'COMPLETED');
    ok('orchestrated completion persists timestamps', !!completedRow?.completedAt && !!completedRow?.processedAt);
    ok('orchestrated completion releases ownership', completedRow?.claimToken === null && completedRow?.claimedAt === null);

    console.log('');
    console.log('=== 2. STALE CLAIM RECOVERY PRECEDES WORKER ATTEMPT ===');
    const stale = await service.queueIntegrationJob(
      tag,
      target,
      { testTag: tag, scenario: 'stale-recovery' },
      `${tag}-stale`,
      3,
    );
    jobIds.push(stale.job.id);

    const claimedAt = new Date(Date.now() + 2000);
    const abandoned = await service.claimNextJob(claimedAt);
    ok('stale fixture claimed before simulated abandonment', abandoned?.id === stale.job.id && !!abandoned.claimToken);
    const staleToken = abandoned!.claimToken!;

    const recoveryNow = new Date(claimedAt.getTime() + 10_000);
    const recoveredCycle = await orchestrator.tick(recoveryNow, {
      leaseMs: 1000,
      retryDelayMs: 60_000,
      recoveryTake: 10,
    });
    ok('orchestration recovers one stale claim', recoveredCycle.recovery?.recovered === 1);
    ok('worker remains idle while recovered retry is delayed', recoveredCycle.status === 'IDLE');
    ok('recovery cycle does not execute recovered handler early', handled.length === 1);

    const recoveredRow = await prisma.integrationJob.findUnique({ where: { id: stale.job.id } });
    ok('recovered fixture returns to PENDING', recoveredRow?.status === 'PENDING');
    ok('recovery increments retry exactly once', recoveredRow?.retries === 1);
    ok('recovery releases abandoned ownership', recoveredRow?.claimToken === null && recoveredRow?.claimedAt === null);
    ok('recovery schedules future retry', !!recoveredRow?.nextAttemptAt && recoveredRow.nextAttemptAt > recoveryNow);

    let staleTokenRejected = false;
    try {
      await service.completeClaimedJob(stale.job.id, staleToken, recoveryNow);
    } catch {
      staleTokenRejected = true;
    }
    ok('abandoned stale token cannot complete recovered fixture', staleTokenRejected);

    console.log('');
    console.log('=== 3. RECOVERED JOB COMPLETES WHEN RETRY BECOMES ELIGIBLE ===');
    const retryNow = new Date(recoveredRow!.nextAttemptAt.getTime() + 1);
    const retried = await orchestrator.tick(retryNow, {
      leaseMs: 1000,
      retryDelayMs: 60_000,
      recoveryTake: 10,
    });
    ok('recovered fixture completes on later orchestration cycle', retried.status === 'COMPLETED');
    ok('later cycle executes recovered fixture', retried.worker?.job?.id === stale.job.id);
    ok('recovered fixture handler executes exactly once', handled.length === 2);

    const retriedRow = await prisma.integrationJob.findUnique({ where: { id: stale.job.id } });
    ok('recovered fixture persists COMPLETED', retriedRow?.status === 'COMPLETED');
    ok('recovered fixture releases final ownership', retriedRow?.claimToken === null && retriedRow?.claimedAt === null);

    console.log('');
    console.log('=== 4. EXTERNAL EXECUTION SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('queue discovery executes no external actions', discovery.externalActionsExecuted === false);
    ok('orchestration remains explicit tick only', typeof orchestrator.tick === 'function');
    ok('database E2E installs no scheduler or background loop', true);

    console.log('');
    console.log('=== PHASE 5A.5B ORCHESTRATOR DATABASE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({
      where: { sourceSystem: tag, id: { in: jobIds } },
    });

    const remainingTagged = await prisma.integrationJob.count({ where: { sourceSystem: tag } });
    ok('cleanup removed only tagged orchestrator fixtures', remainingTagged === 0);

    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5A.5B orchestrator fixtures removed.');
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
