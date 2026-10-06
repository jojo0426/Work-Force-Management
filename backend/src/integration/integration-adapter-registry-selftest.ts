import { IntegrationAdapterRegistryService } from './integration-adapter-registry.service';
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
  console.log('\n=== PHASE 5C.2 ADAPTER CONTRACT / REGISTRY FOUNDATION ===');

  await withEnv({}, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    let calls = 0;

    const registration = registry.register(' crm ', async () => { calls += 1; });
    ok('registry normalizes adapter target', registration.targetSystem === 'CRM');
    ok('registry records adapter registration', registry.isRegistered('crm'));
    ok('registration reports target denied by default policy', registration.policyAllowed === false);
    ok('registration reports execution disabled by default policy', registration.executionEnabled === false);

    const result = await executor.execute({
      jobId: 'phase5c2-default',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: {},
    });
    ok('registered adapter remains blocked by fail-closed policy', result.status === 'BLOCKED' && result.reason === 'EXECUTION_DISABLED');
    ok('adapter registration alone executes no external action', calls === 0);

    let duplicateRejected = false;
    try { registry.register('CRM', async () => undefined); } catch { duplicateRejected = true; }
    ok('duplicate target registration is rejected', duplicateRejected);
  });

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM,SMS',
  }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    let calls = 0;

    registry.register('SMS', async () => undefined);
    const registration = registry.register('CRM', async () => { calls += 1; return { status: 'SUCCESS' }; });
    ok('registration exposes configured allow-list state', registration.policyAllowed === true);
    ok('registration exposes configured global execution state', registration.executionEnabled === true);
    ok('registry listing is deterministic', registry.list().map((entry) => entry.targetSystem).join(',') === 'CRM,SMS');

    const result = await executor.execute({
      jobId: 'phase5c2-enabled',
      sourceSystem: 'WFM',
      targetSystem: 'crm',
      payload: {},
    });
    ok('policy-authorized registered adapter executes', result.status === 'EXECUTED');
    ok('authorized registry adapter executes exactly once', calls === 1);
  });

  console.log('Phase 5C.2 adapter contract / registry foundation passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
