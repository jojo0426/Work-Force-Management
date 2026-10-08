import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';

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

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.4C PROVIDER IDEMPOTENCY PROPAGATION ===');

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
  }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const seenJobIds: string[] = [];
    const committedJobs = new Set<string>();
    let sideEffects = 0;

    executor.registerAdapter('CRM', async (context) => {
      seenJobIds.push(context.jobId);
      if (!committedJobs.has(context.jobId)) {
        committedJobs.add(context.jobId);
        sideEffects += 1;
      }
      return { status: 'SUCCESS' };
    });

    const context = {
      jobId: 'phase5c4c-stable-job',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: { subscriberId: 'controlled-test', action: 'SYNC' },
    };

    const first = await executor.execute(context);
    const retry = await executor.execute(context);

    ok('first authorized provider attempt executes', first.status === 'EXECUTED');
    ok('retry attempt remains authorized through executor', retry.status === 'EXECUTED');
    ok('stable durable job identity reaches every provider attempt', seenJobIds.length === 2 && seenJobIds.every((id) => id === context.jobId));
    ok('provider can deduplicate retries by durable job identity', sideEffects === 1);
    ok('idempotent provider records one committed durable identity', committedJobs.size === 1);
  });

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
  }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const committedJobs = new Set<string>();
    let sideEffects = 0;

    executor.registerAdapter('CRM', async (context) => {
      if (!committedJobs.has(context.jobId)) {
        committedJobs.add(context.jobId);
        sideEffects += 1;
      }
      return { status: 'SUCCESS' };
    });

    await executor.execute({ jobId: 'phase5c4c-job-a', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });
    await executor.execute({ jobId: 'phase5c4c-job-b', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });

    ok('different durable jobs remain distinct provider operations', sideEffects === 2 && committedJobs.size === 2);
  });

  await withEnv({}, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    let calls = 0;

    executor.registerAdapter('CRM', async () => {
      calls += 1;
      return { status: 'SUCCESS' };
    });

    const result = await executor.execute({
      jobId: 'phase5c4c-blocked',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: {},
    });

    ok('idempotency propagation preserves fail-closed default', result.status === 'BLOCKED');
    ok('blocked provider receives no durable identity', calls === 0);
  });

  console.log('Phase 5C.4C provider idempotency propagation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
