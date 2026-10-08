import { PrismaClient } from '@prisma/client';
import { IntegrationService } from './integration.service';

const prisma = new PrismaClient();
const service = new IntegrationService(prisma as any);
const tag = `integration-queue-e2e-${Date.now()}`;

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function rejects(name: string, fn: () => Promise<unknown>, expected: string) {
  try {
    await fn();
    throw new Error(`FAIL: ${name} — expected rejection`);
  } catch (error: any) {
    const message = String(error?.message ?? error);
    if (!message.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(`FAIL: ${name} — expected "${expected}", received "${message}"`);
    }
    console.log(`PASS: ${name}`);
  }
}

async function main() {
  console.log('');
  console.log('=== PHASE 5A.2B INTEGRATION QUEUE DATABASE CONCURRENCY E2E ===');
  console.log(`Test tag: ${tag}`);

  let jobId: string | null = null;
  const baselineCount = await prisma.integrationJob.count();

  try {
    console.log('');
    console.log('=== 1. CREATE ISOLATED QUEUE FIXTURE ===');
    const queued = await service.queueIntegrationJob(
      tag,
      'TEST_TARGET',
      { testTag: tag, purpose: 'Phase 5A.2B database concurrency' },
      `${tag}-event`,
      3,
    );
    jobId = queued.job.id;
    ok('isolated queue fixture created', queued.idempotent === false && queued.job.status === 'PENDING');

    console.log('');
    console.log('=== 2. CONCURRENT CLAIM RACE ===');
    const claimAt = new Date(Date.now() + 1000);
    const [claimA, claimB] = await Promise.all([
      service.claimNextJob(claimAt),
      service.claimNextJob(claimAt),
    ]);
    const claims = [claimA, claimB].filter((claim) => claim?.id === jobId);
    ok('exactly one concurrent claimant wins', claims.length === 1);
    const winner = claims[0]!;
    ok('winning claim is PROCESSING', winner.status === 'PROCESSING');
    ok('winning claim has ownership token', !!winner.claimToken);

    const processingRows = await prisma.integrationJob.count({
      where: { id: jobId, status: 'PROCESSING' },
    });
    ok('database contains exactly one PROCESSING fixture row', processingRows === 1);

    console.log('');
    console.log('=== 3. OWNERSHIP TOKEN PROTECTION ===');
    await rejects(
      'wrong token cannot complete claimed job',
      () => service.completeClaimedJob(jobId!, 'wrong-token'),
      'no longer owned',
    );

    console.log('');
    console.log('=== 4. FAILURE RETURNS JOB TO SCHEDULED PENDING ===');
    const failedAt = new Date();
    const failed = await service.failClaimedJob(
      jobId,
      winner.claimToken!,
      new Error('Phase 5A.2B controlled retry'),
      2000,
      failedAt,
    );
    ok('owned failure returns job to PENDING', failed?.status === 'PENDING');
    ok('owned failure increments retry count', failed?.retries === 1);
    ok('failure releases claim token', failed?.claimToken === null);

    const early = await service.claimNextJob(new Date(failedAt.getTime() + 1000));
    ok('retry schedule prevents early reclaim', early?.id !== jobId);

    console.log('');
    console.log('=== 5. SCHEDULED RECLAIM + STALE TOKEN PROTECTION ===');
    const reclaimed = await service.claimNextJob(new Date(failedAt.getTime() + 3000));
    ok('scheduled fixture becomes claimable again', reclaimed?.id === jobId);
    ok('reclaim receives a new ownership token', !!reclaimed?.claimToken && reclaimed.claimToken !== winner.claimToken);

    await rejects(
      'stale first claim token cannot complete new claim',
      () => service.completeClaimedJob(jobId!, winner.claimToken!),
      'no longer owned',
    );

    console.log('');
    console.log('=== 6. CURRENT OWNER COMPLETES ===');
    const completed = await service.completeClaimedJob(jobId, reclaimed!.claimToken!);
    ok('current owner transitions fixture to COMPLETED', completed?.status === 'COMPLETED');
    ok('completion releases claim token', completed?.claimToken === null);
    ok('completion timestamp persisted', !!completed?.completedAt && !!completed?.processedAt);

    const final = await prisma.integrationJob.findUnique({ where: { id: jobId } });
    ok('final durable state is exactly COMPLETED', final?.status === 'COMPLETED' && final.retries === 1);

    console.log('');
    console.log('=== 7. EXTERNAL EXECUTION SAFETY ===');
    const discovery = await service.processPendingJobs();
    ok('queue discovery still executes no external actions', discovery.externalActionsExecuted === false);

    console.log('');
    console.log('=== PHASE 5A.2B DATABASE CONCURRENCY E2E PASSED ===');
  } finally {
    console.log('');
    console.log('=== CLEANUP ===');
    if (jobId) {
      await prisma.integrationJob.deleteMany({
        where: { id: jobId, sourceSystem: tag },
      });
    }

    const remainingTagged = await prisma.integrationJob.count({
      where: { sourceSystem: tag },
    });
    ok('cleanup removed only tagged queue fixture', remainingTagged === 0);

    const finalCount = await prisma.integrationJob.count();
    ok('database queue row count returned to baseline', finalCount === baselineCount);
    console.log('PASS: isolated Phase 5A.2B fixture removed.');
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
