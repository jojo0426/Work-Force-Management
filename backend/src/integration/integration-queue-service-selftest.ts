import { IntegrationService } from './integration.service';

type Job = {
  id: string;
  sourceSystem: string;
  targetSystem: string | null;
  payload: any;
  status: string;
  idempotencyKey: string | null;
  retries: number;
  maxRetries: number;
  nextAttemptAt: Date;
  claimedAt: Date | null;
  claimToken: string | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  completedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  processedAt: Date | null;
};

function ok(name: string, value: unknown) {
  if (!value) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function rejects(name: string, fn: () => Promise<unknown>, text: string) {
  try {
    await fn();
    throw new Error(`FAIL: ${name} — expected rejection`);
  } catch (error: any) {
    if (!String(error?.message ?? error).includes(text)) throw error;
    console.log(`PASS: ${name}`);
  }
}

function harness() {
  const jobs: Job[] = [];
  let sequence = 0;

  const delegate: any = {
    findUnique: async ({ where }: any) => {
      if (where.id) return jobs.find((j) => j.id === where.id) ?? null;
      const key = where.sourceSystem_idempotencyKey;
      if (key) return jobs.find((j) => j.sourceSystem === key.sourceSystem && j.idempotencyKey === key.idempotencyKey) ?? null;
      return null;
    },
    findFirst: async ({ where }: any) => jobs.find((j) =>
      (!where.id || j.id === where.id) &&
      (!where.status || j.status === where.status) &&
      (where.claimToken === undefined || j.claimToken === where.claimToken) &&
      (!where.nextAttemptAt?.lte || j.nextAttemptAt <= where.nextAttemptAt.lte)
    ) ?? null,
    findMany: async ({ where, take }: any) => jobs.filter((j) =>
      (!where?.status || j.status === where.status) &&
      (!where?.nextAttemptAt?.lte || j.nextAttemptAt <= where.nextAttemptAt.lte)
    ).slice(0, take ?? jobs.length),
    create: async ({ data }: any) => {
      if (data.idempotencyKey && jobs.some((j) => j.sourceSystem === data.sourceSystem && j.idempotencyKey === data.idempotencyKey)) {
        const e: any = new Error('Unique constraint'); e.code = 'P2002'; throw e;
      }
      const job: Job = { id: `job-${++sequence}`, status: 'PENDING', retries: 0, maxRetries: 5, nextAttemptAt: new Date(), claimedAt: null, claimToken: null, lastAttemptAt: null, lastError: null, completedAt: null, failedAt: null, processedAt: null, createdAt: new Date(), ...data };
      jobs.push(job); return job;
    },
    updateMany: async ({ where, data }: any) => {
      const match = jobs.find((j) =>
        (!where.id || j.id === where.id) &&
        (!where.status || j.status === where.status) &&
        (where.claimToken === undefined || j.claimToken === where.claimToken) &&
        (where.retries === undefined || j.retries === where.retries) &&
        (!where.nextAttemptAt?.lte || j.nextAttemptAt <= where.nextAttemptAt.lte)
      );
      if (!match) return { count: 0 };
      Object.assign(match, data); return { count: 1 };
    },
  };
  const prisma: any = { integrationJob: delegate, $transaction: async (fn: any) => fn({ integrationJob: delegate }) };
  return { jobs, service: new IntegrationService(prisma) };
}

async function main() {
  const h = harness();
  const first = await h.service.queueIntegrationJob('WFM', 'BILLING', { workOrderId: 'wo-1' }, 'event-1', 2);
  ok('enqueue creates PENDING durable job', first.job.status === 'PENDING' && first.idempotent === false);
  const retry = await h.service.queueIntegrationJob('WFM', 'BILLING', { workOrderId: 'wo-1' }, 'event-1', 2);
  ok('same source/idempotency key returns existing job', retry.idempotent === true && retry.job.id === first.job.id && h.jobs.length === 1);

  const claim = await h.service.claimNextJob(new Date(Date.now() + 1000));
  ok('eligible job is atomically claimed', claim?.status === 'PROCESSING' && !!claim.claimToken && !!claim.claimedAt && !!claim.lastAttemptAt);
  const secondClaim = await h.service.claimNextJob(new Date(Date.now() + 1000));
  ok('claimed job cannot be claimed twice', secondClaim === null);
  await rejects('wrong token cannot complete job', () => h.service.completeClaimedJob(first.job.id, 'wrong-token'), 'no longer owned');

  const failed = await h.service.failClaimedJob(first.job.id, claim!.claimToken!, new Error('temporary failure'), 1000, new Date());
  ok('first failure returns job to PENDING', failed?.status === 'PENDING' && failed.retries === 1 && failed.claimToken === null && failed.lastError === 'temporary failure');
  const tooEarly = await h.service.claimNextJob(new Date());
  ok('retry delay prevents early claim', tooEarly === null);

  const reclaim = await h.service.claimNextJob(new Date(Date.now() + 2000));
  ok('scheduled retry becomes claimable', reclaim?.status === 'PROCESSING' && reclaim.retries === 1);
  const terminal = await h.service.failClaimedJob(first.job.id, reclaim!.claimToken!, 'permanent failure', 1000, new Date());
  ok('retry exhaustion transitions to FAILED', terminal?.status === 'FAILED' && terminal.retries === 2 && !!terminal.failedAt && terminal.claimToken === null);

  const completedSeed = await h.service.queueIntegrationJob('WFM', 'CRM', { workOrderId: 'wo-2' }, 'event-2');
  const completedClaim = await h.service.claimNextJob(new Date(Date.now() + 1000));
  const completed = await h.service.completeClaimedJob(completedSeed.job.id, completedClaim!.claimToken!);
  ok('owned claim transitions to COMPLETED', completed?.status === 'COMPLETED' && !!completed.completedAt && !!completed.processedAt && completed.claimToken === null);

  const discovery = await h.service.processPendingJobs();
  ok('pending discovery never executes external actions', discovery.externalActionsExecuted === false);
  console.log('Durable integration queue service regression gate passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
