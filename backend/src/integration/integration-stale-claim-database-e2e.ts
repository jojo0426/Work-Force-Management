import { PrismaClient } from '@prisma/client';
import { IntegrationService } from './integration.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const tag = `integration-stale-claim-e2e-${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('');
  console.log('=== PHASE 5A.4A STALE CLAIM RECOVERY DATABASE E2E ===');
  console.log(`Test tag: ${tag}`);

  const baselineCount = await prisma.integrationJob.count();
  const jobIds: string[] = [];
  const now = new Date();
  const oldClaimedAt = new Date(now.getTime() - 10 * 60_000);
  const freshClaimedAt = new Date(now.getTime() - 30_000);

  try {
    console.log('');
    console.log('=== 1. EXPIRED CLAIM RETURNS TO SCHEDULED PENDING ===');
    const recoverable = await service.queueIntegrationJob(tag, 'LOCAL_RECOVERY', { scenario: 'recoverable' }, `${tag}-recoverable`, 3);
    jobIds.push(recoverable.job.id);
    const recoverableClaim = await service.claimNextJob(new Date(now.getTime() + 1000));
    ok('recoverable fixture claimed', recoverableClaim?.id === recoverable.job.id && !!recoverableClaim.claimToken);
    const staleToken = recoverableClaim!.claimToken!;
    await prisma.integrationJob.update({ where: { id: recoverable.job.id }, data: { claimedAt: oldClaimedAt } });

    const recovered = await service.recoverStaleClaims(now, 5 * 60_000, 60_000);
    ok('exactly one expired claim recovered', recovered.recovered === 1 && recovered.failed === 0);
    ok('recovery reports no external execution', recovered.externalActionsExecuted === false);

    const recoveredRow = await prisma.integrationJob.findUnique({ where: { id: recoverable.job.id } });
    ok('expired claim returns to PENDING', recoveredRow?.status === 'PENDING');
    ok('expired claim increments retry exactly once', recoveredRow?.retries === 1);
    ok('expired claim releases ownership', recoveredRow?.claimToken === null && recoveredRow?.claimedAt === null);
    ok('expired claim records diagnostic error', recoveredRow?.lastError?.includes('claim lease expired'));
    ok('expired claim receives future retry schedule', !!recoveredRow && recoveredRow.nextAttemptAt.getTime() > now.getTime());

    let staleRejected = false;
    try {
      await service.completeClaimedJob(recoverable.job.id, staleToken, now);
    } catch (error: any) {
      staleRejected = String(error?.message ?? error).includes('no longer owned');
    }
    ok('abandoned worker stale token cannot complete recovered job', staleRejected);

    console.log('');
    console.log('=== 2. FRESH CLAIM IS PROTECTED ===');
    const fresh = await service.queueIntegrationJob(tag, 'LOCAL_RECOVERY', { scenario: 'fresh' }, `${tag}-fresh`, 3);
    jobIds.push(fresh.job.id);
    const freshClaim = await service.claimNextJob(new Date(now.getTime() + 2000));
    ok('fresh fixture claimed', freshClaim?.id === fresh.job.id);
    await prisma.integrationJob.update({ where: { id: fresh.job.id }, data: { claimedAt: freshClaimedAt } });

    const freshRecovery = await service.recoverStaleClaims(now, 5 * 60_000, 0);
    const freshRow = await prisma.integrationJob.findUnique({ where: { id: fresh.job.id } });
    ok('non-expired claim is not recovered', freshRecovery.recovered === 0 && freshRecovery.failed === 0);
    ok('non-expired claim keeps PROCESSING ownership', freshRow?.status === 'PROCESSING' && freshRow?.claimToken === freshClaim!.claimToken);

    console.log('');
    console.log('=== 3. EXPIRED CLAIM CAN TERMINATE AT RETRY CEILING ===');
    const terminal = await service.queueIntegrationJob(tag, 'LOCAL_RECOVERY', { scenario: 'terminal' }, `${tag}-terminal`, 1);
    jobIds.push(terminal.job.id);
    // Keep the fresh fixture out of claim discovery so the terminal fixture is selected.
    await prisma.integrationJob.update({ where: { id: fresh.job.id }, data: { status: 'COMPLETED', completedAt: now, processedAt: now, claimToken: null, claimedAt: null } });
    const terminalClaim = await service.claimNextJob(new Date(now.getTime() + 3000));
    ok('terminal fixture claimed', terminalClaim?.id === terminal.job.id);
    await prisma.integrationJob.update({ where: { id: terminal.job.id }, data: { claimedAt: oldClaimedAt } });

    const terminalRecovery = await service.recoverStaleClaims(now, 5 * 60_000, 0);
    const terminalRow = await prisma.integrationJob.findUnique({ where: { id: terminal.job.id } });
    ok('expired claim at retry ceiling becomes FAILED', terminalRecovery.failed === 1 && terminalRow?.status === 'FAILED');
    ok('terminal recovery persists failedAt', !!terminalRow?.failedAt);
    ok('terminal recovery releases ownership', terminalRow?.claimToken === null && terminalRow?.claimedAt === null);

    console.log('');
    console.log('=== 4. CONCURRENT RECOVERY HAS SINGLE WINNER ===');
    const raced = await service.queueIntegrationJob(tag, 'LOCAL_RECOVERY', { scenario: 'race' }, `${tag}-race`, 3);
    jobIds.push(raced.job.id);
    const racedClaim = await service.claimNextJob(new Date(now.getTime() + 4000));
    ok('race fixture claimed', racedClaim?.id === raced.job.id);
    await prisma.integrationJob.update({ where: { id: raced.job.id }, data: { claimedAt: oldClaimedAt } });

    const [r1, r2] = await Promise.all([
      service.recoverStaleClaims(now, 5 * 60_000, 60_000),
      service.recoverStaleClaims(now, 5 * 60_000, 60_000),
    ]);
    ok('concurrent recovery mutates expired claim once', r1.recovered + r2.recovered === 1);
    const racedRow = await prisma.integrationJob.findUnique({ where: { id: raced.job.id } });
    ok('concurrent recovery increments retry once', racedRow?.retries === 1);
    ok('concurrent recovery leaves durable PENDING state', racedRow?.status === 'PENDING' && racedRow?.claimToken === null);

    console.log('');
    console.log('=== 5. EXTERNAL EXECUTION SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('recovery and discovery execute no external actions', discovery.externalActionsExecuted === false);

    console.log('');
    console.log('=== PHASE 5A.4A STALE CLAIM RECOVERY DATABASE E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    await prisma.integrationJob.deleteMany({ where: { sourceSystem: tag, id: { in: jobIds } } });
    const remainingTagged = await prisma.integrationJob.count({ where: { sourceSystem: tag } });
    ok('cleanup removed only tagged recovery fixtures', remainingTagged === 0);
    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5A.4A recovery fixtures removed.');
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
