import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';
import { IntegrationWorkerService } from './integration-worker.service';

const POLICY_ENV_KEYS = [
  'INTEGRATION_EXECUTION_ENABLED',
  'INTEGRATION_ALLOWED_TARGETS',
  'INTEGRATION_EXECUTION_TIMEOUT_MS',
  'INTEGRATION_RETRY_DELAY_MS',
] as const;

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function withEnv(values: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const before = new Map(POLICY_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of POLICY_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    await fn();
  } finally {
    for (const key of POLICY_ENV_KEYS) {
      const value = before.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

type DurableJob = {
  id: string;
  sourceSystem: string;
  targetSystem: string;
  payload: unknown;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  retries: number;
  maxRetries: number;
  nextAttemptAt: Date;
  claimToken: string | null;
  lastError: string | null;
};

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.5 DURABLE PROVIDER RETRY / QUEUE INTEGRATION ===');

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
    INTEGRATION_RETRY_DELAY_MS: '30',
  }, async () => {
    const job: DurableJob = {
      id: 'phase5c5-durable-job',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: { subscriberId: 'controlled-test', action: 'SYNC' },
      status: 'PENDING',
      retries: 0,
      maxRetries: 3,
      nextAttemptAt: new Date(0),
      claimToken: null,
      lastError: null,
    };

    let claimSequence = 0;
    const claimTokens: string[] = [];
    const providerJobIds: string[] = [];
    const committedJobs = new Set<string>();
    let providerAttempts = 0;
    let sideEffects = 0;

    const integration: any = {
      claimNextJob: async (now: Date) => {
        if (job.status !== 'PENDING' || job.nextAttemptAt.getTime() > now.getTime()) return null;
        claimSequence += 1;
        const token = `claim-${claimSequence}`;
        claimTokens.push(token);
        job.status = 'PROCESSING';
        job.claimToken = token;
        return { ...job };
      },
      failClaimedJob: async (id: string, token: string, error: unknown, retryDelayMs: number, now: Date) => {
        if (id !== job.id || job.status !== 'PROCESSING' || job.claimToken !== token) {
          throw new Error('claim ownership mismatch');
        }
        job.retries += 1;
        job.lastError = String((error as any)?.message ?? error);
        job.status = job.retries >= job.maxRetries ? 'FAILED' : 'PENDING';
        job.nextAttemptAt = new Date(now.getTime() + retryDelayMs);
        job.claimToken = null;
        return { ...job };
      },
      completeClaimedJob: async (id: string, token: string) => {
        if (id !== job.id || job.status !== 'PROCESSING' || job.claimToken !== token) {
          throw new Error('claim ownership mismatch');
        }
        job.status = 'COMPLETED';
        job.claimToken = null;
        job.lastError = null;
        return { ...job };
      },
    };

    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const worker = new IntegrationWorkerService(integration, executor);
    worker.registerExecutorHandler('CRM');

    executor.registerAdapter('CRM', async (context) => {
      providerAttempts += 1;
      providerJobIds.push(context.jobId);

      if (providerAttempts === 1) {
        return { status: 'RETRYABLE_FAILURE', message: 'controlled transient provider failure' };
      }

      if (!committedJobs.has(context.jobId)) {
        committedJobs.add(context.jobId);
        sideEffects += 1;
      }
      return { status: 'SUCCESS' };
    });

    const firstAt = new Date('2026-10-06T00:00:00.000Z');
    const first = await worker.runOnce(firstAt, 30);
    ok('first durable claim reaches controlled provider', providerAttempts === 1);
    ok('transient provider failure uses durable failure transition', first.status === 'FAILED');
    ok('failed durable job returns to PENDING', job.status === 'PENDING');
    ok('durable retry counter advances after provider failure', job.retries === 1);
    ok('transient provider diagnostic is persisted', job.lastError === 'controlled transient provider failure');
    ok('failed provider attempt reports no completed external action', first.externalActionsExecuted === false);

    const early = await worker.runOnce(new Date(firstAt.getTime() + 29), 30);
    ok('retry is not claimable before nextAttemptAt', early.status === 'IDLE' && providerAttempts === 1);

    const retry = await worker.runOnce(new Date(firstAt.getTime() + 30), 30);
    ok('scheduled durable retry reaches provider', providerAttempts === 2);
    ok('retry reuses same durable job identity', providerJobIds.length === 2 && providerJobIds.every((id) => id === job.id));
    ok('retry obtains new ownership token', claimTokens.length === 2 && claimTokens[0] !== claimTokens[1]);
    ok('successful retry completes durable job', retry.status === 'COMPLETED' && job.status === 'COMPLETED');
    ok('successful retry reports external execution', retry.externalActionsExecuted === true);
    ok('provider idempotency commits one external side effect', sideEffects === 1 && committedJobs.size === 1);

    const afterCompletion = await worker.runOnce(new Date(firstAt.getTime() + 100), 30);
    ok('completed durable job cannot execute a third time', afterCompletion.status === 'IDLE' && providerAttempts === 2);
  });

  await withEnv({}, async () => {
    const blockedJob = {
      id: 'phase5c5-blocked', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {},
      status: 'PENDING', retries: 0, maxRetries: 2, nextAttemptAt: new Date(0), claimToken: null as string | null,
    };
    let calls = 0;
    const integration: any = {
      claimNextJob: async () => {
        if (blockedJob.status !== 'PENDING') return null;
        blockedJob.status = 'PROCESSING';
        blockedJob.claimToken = 'blocked-claim';
        return { ...blockedJob };
      },
      failClaimedJob: async () => {
        blockedJob.status = 'PENDING';
        blockedJob.retries += 1;
        blockedJob.claimToken = null;
        return { ...blockedJob };
      },
      completeClaimedJob: async () => { throw new Error('blocked execution must never complete'); },
    };
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const worker = new IntegrationWorkerService(integration, executor);
    worker.registerExecutorHandler('CRM');
    executor.registerAdapter('CRM', async () => { calls += 1; return { status: 'SUCCESS' }; });

    const result = await worker.runOnce(new Date(), 30);
    ok('durable retry integration preserves fail-closed policy', result.status === 'FAILED');
    ok('fail-closed durable attempt invokes no provider', calls === 0);
    ok('blocked durable attempt remains retryable', blockedJob.status === 'PENDING' && blockedJob.retries === 1);
  });

  console.log('Phase 5C.5 durable provider retry / queue integration passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
