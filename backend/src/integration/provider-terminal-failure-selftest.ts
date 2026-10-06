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
  claimedAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
};

function makeIntegration(job: DurableJob) {
  let sequence = 0;
  return {
    claimNextJob: async (now: Date) => {
      if (job.status !== 'PENDING' || job.nextAttemptAt.getTime() > now.getTime()) return null;
      sequence += 1;
      job.status = 'PROCESSING';
      job.claimToken = `claim-${sequence}`;
      job.claimedAt = now;
      return { ...job };
    },
    failClaimedJob: async (id: string, token: string, error: unknown, retryDelayMs: number, now: Date) => {
      if (id !== job.id || job.status !== 'PROCESSING' || job.claimToken !== token) throw new Error('claim ownership mismatch');
      job.retries += 1;
      const exhausted = job.retries >= job.maxRetries;
      job.status = exhausted ? 'FAILED' : 'PENDING';
      job.lastError = String((error as any)?.message ?? error ?? 'Unknown integration error').slice(0, 4000);
      job.failedAt = exhausted ? now : null;
      if (!exhausted) job.nextAttemptAt = new Date(now.getTime() + Math.max(0, retryDelayMs));
      job.claimToken = null;
      job.claimedAt = null;
      return { ...job };
    },
    completeClaimedJob: async (id: string, token: string, completedAt: Date) => {
      if (id !== job.id || job.status !== 'PROCESSING' || job.claimToken !== token) throw new Error('claim ownership mismatch');
      job.status = 'COMPLETED';
      job.claimToken = null;
      job.claimedAt = null;
      job.lastError = null;
      return { ...job, completedAt };
    },
  };
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.6 RETRY EXHAUSTION / TERMINAL FAILURE SAFETY ===');

  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'CRM' }, async () => {
    const job: DurableJob = {
      id: 'phase5c6-exhaustion', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {},
      status: 'PENDING', retries: 0, maxRetries: 2, nextAttemptAt: new Date(0), claimToken: null,
      claimedAt: null, failedAt: null, lastError: null,
    };
    const integration: any = makeIntegration(job);
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    const worker = new IntegrationWorkerService(integration, executor);
    worker.registerExecutorHandler('CRM');
    let attempts = 0;
    executor.registerAdapter('CRM', async () => {
      attempts += 1;
      return { status: 'RETRYABLE_FAILURE', message: `controlled transient failure ${attempts}` };
    });

    const t0 = new Date('2026-10-06T00:00:00.000Z');
    const first = await worker.runOnce(t0, 30);
    ok('first transient failure remains retryable', first.status === 'FAILED' && job.status === 'PENDING' && job.retries === 1);
    ok('first transient diagnostic is persisted', job.lastError === 'controlled transient failure 1');
    ok('first failed attempt reports no completed external action', first.externalActionsExecuted === false);

    const second = await worker.runOnce(new Date(t0.getTime() + 30), 30);
    ok('retry exhaustion transitions durable job to FAILED', second.status === 'FAILED' && job.status === 'FAILED' && job.retries === 2);
    ok('terminal failure records failedAt', job.failedAt?.getTime() === t0.getTime() + 30);
    ok('terminal failure preserves final diagnostic', job.lastError === 'controlled transient failure 2');
    ok('terminal failure releases claim ownership', job.claimToken === null && job.claimedAt === null);
    ok('exhausted provider performed only configured attempts', attempts === 2);

    const afterTerminal = await worker.runOnce(new Date(t0.getTime() + 60), 30);
    ok('terminal FAILED job cannot be reclaimed', afterTerminal.status === 'IDLE');
    ok('terminal FAILED job cannot execute provider again', attempts === 2);
  });

  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'CRM' }, async () => {
    const job: DurableJob = {
      id: 'phase5c6-permanent', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {},
      status: 'PENDING', retries: 0, maxRetries: 1, nextAttemptAt: new Date(0), claimToken: null,
      claimedAt: null, failedAt: null, lastError: null,
    };
    const integration: any = makeIntegration(job);
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    const worker = new IntegrationWorkerService(integration, executor);
    worker.registerExecutorHandler('CRM');
    let attempts = 0;
    executor.registerAdapter('CRM', async () => {
      attempts += 1;
      return { status: 'REJECTED', message: 'controlled provider rejection' };
    });

    const result = await worker.runOnce(new Date('2026-10-06T01:00:00.000Z'), 30);
    ok('permanent provider rejection reaches durable failure boundary', result.status === 'FAILED');
    ok('single-attempt retry policy makes permanent rejection terminal', job.status === 'FAILED' && job.retries === 1);
    ok('permanent provider diagnostic survives terminal transition', job.lastError === 'controlled provider rejection');
    ok('permanent rejection reports no completed external action', result.externalActionsExecuted === false);
    const after = await worker.runOnce(new Date('2026-10-06T01:01:00.000Z'), 30);
    ok('terminal permanent rejection cannot execute again', after.status === 'IDLE' && attempts === 1);
  });

  await withEnv({}, async () => {
    const job: DurableJob = {
      id: 'phase5c6-blocked', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {},
      status: 'PENDING', retries: 0, maxRetries: 1, nextAttemptAt: new Date(0), claimToken: null,
      claimedAt: null, failedAt: null, lastError: null,
    };
    const integration: any = makeIntegration(job);
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    const worker = new IntegrationWorkerService(integration, executor);
    worker.registerExecutorHandler('CRM');
    let calls = 0;
    executor.registerAdapter('CRM', async () => { calls += 1; return { status: 'SUCCESS' }; });

    const result = await worker.runOnce(new Date(), 30);
    ok('terminal safety preserves fail-closed execution policy', result.status === 'FAILED' && job.status === 'FAILED');
    ok('fail-closed terminal transition invokes no provider', calls === 0);
    ok('blocked terminal diagnostic is retained', Boolean(job.lastError?.includes('Integration executor blocked CRM')));
  });

  console.log('Phase 5C.6 retry exhaustion / terminal failure safety passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
