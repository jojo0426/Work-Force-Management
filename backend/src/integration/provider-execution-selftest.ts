import { IntegrationAdapterLifecycleService } from './integration-adapter-lifecycle.service';
import { IntegrationAdapterRegistryService } from './integration-adapter-registry.service';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';
import { ProviderAdapter } from './provider-adapter.contract';
import { providerAdapterDefinition } from './provider-adapter.factory';

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

function provider(execute: ProviderAdapter['execute']): ProviderAdapter {
  return {
    descriptor: { targetSystem: 'CRM', providerName: 'Controlled CRM Provider', externalExecution: true },
    execute,
  };
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

function stack(adapter: ProviderAdapter) {
  const policy = new IntegrationPolicyService();
  const executor = new IntegrationExecutorService(policy);
  const registry = new IntegrationAdapterRegistryService(executor, policy);
  const lifecycle = new IntegrationAdapterLifecycleService(registry);
  lifecycle.initialize([providerAdapterDefinition(adapter)]);
  return { executor, registry, lifecycle };
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.4 CONTROLLED PROVIDER EXECUTION FOUNDATION ===');

  await withEnv({}, async () => {
    let calls = 0;
    const { executor } = stack(provider(async () => {
      calls += 1;
      return { status: 'SUCCESS' };
    }));

    const result = await executor.execute({ jobId: 'phase5c4-disabled', sourceSystem: 'WFM', targetSystem: 'CRM', payload: { case: 'disabled' } });
    ok('provider execution is disabled by default', result.status === 'BLOCKED' && result.reason === 'EXECUTION_DISABLED');
    ok('disabled execution invokes no provider', calls === 0);
    ok('disabled execution reports no external action', result.externalActionsExecuted === false);
  });

  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'SMS' }, async () => {
    let calls = 0;
    const { executor } = stack(provider(async () => {
      calls += 1;
      return { status: 'SUCCESS' };
    }));

    const result = await executor.execute({ jobId: 'phase5c4-denied', sourceSystem: 'WFM', targetSystem: 'CRM', payload: { case: 'denied' } });
    ok('provider target must be explicitly allow-listed', result.status === 'BLOCKED' && result.reason === 'TARGET_NOT_ALLOWED');
    ok('non-allow-listed provider is never invoked', calls === 0);
  });

  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'CRM' }, async () => {
    let calls = 0;
    let seenJob = '';
    let seenSource = '';
    let seenTarget = '';
    let seenPayload: unknown;
    const { executor } = stack(provider(async (context) => {
      calls += 1;
      seenJob = context.jobId;
      seenSource = context.sourceSystem;
      seenTarget = context.targetSystem;
      seenPayload = context.payload;
      return { status: 'SUCCESS' };
    }));

    const payload = { subscriberId: 'controlled-test', action: 'SYNC' };
    const result = await executor.execute({ jobId: 'phase5c4-success', sourceSystem: 'WFM', targetSystem: 'crm', payload });
    ok('authorized provider executes successfully', result.status === 'EXECUTED');
    ok('authorized provider reports external action boundary', result.externalActionsExecuted === true);
    ok('authorized provider executes exactly once', calls === 1);
    ok('provider receives durable job identity', seenJob === 'phase5c4-success');
    ok('provider receives source identity', seenSource === 'WFM');
    ok('provider receives canonical target identity', seenTarget === 'CRM');
    ok('provider receives original controlled payload', seenPayload === payload);
  });

  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'CRM' }, async () => {
    let calls = 0;
    const { executor } = stack(provider(async () => {
      calls += 1;
      return { status: 'PERMANENT_FAILURE', message: 'controlled provider rejection' };
    }));

    const result = await executor.execute({ jobId: 'phase5c4-permanent', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });
    ok('provider permanent failure is classified by executor', result.status === 'FAILED' && result.failureClass === 'PERMANENT');
    ok('provider permanent failure is not reported as external success', result.externalActionsExecuted === false);
    ok('provider permanent failure executes one controlled attempt', calls === 1);
  });

  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'CRM' }, async () => {
    let calls = 0;
    const { executor } = stack(provider(async () => {
      calls += 1;
      throw new Error('controlled transient provider failure');
    }));

    const result = await executor.execute({ jobId: 'phase5c4-transient', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });
    ok('provider exception is classified transient', result.status === 'FAILED' && result.failureClass === 'TRANSIENT');
    ok('provider exception is not reported as external success', result.externalActionsExecuted === false);
    ok('provider exception executes one controlled attempt', calls === 1);
  });

  console.log('Phase 5C.4 controlled provider execution foundation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
