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

function rejects(name: string, fn: () => unknown): void {
  let rejected = false;
  try { fn(); } catch { rejected = true; }
  ok(name, rejected);
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
  console.log('\n=== PHASE 5C.2A ADAPTER CONTRACT HARDENING ===');

  await withEnv({}, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);

    rejects('empty target is rejected', () => registry.register('', async () => undefined));
    rejects('whitespace target is rejected', () => registry.register('   ', async () => undefined));
    rejects('malformed target is rejected', () => registry.register('CRM PROD!', async () => undefined));
    rejects('path-like target is rejected', () => registry.register('../CRM', async () => undefined));
    rejects('non-function adapter is rejected', () => registry.register('CRM', null as any));
    ok('failed registrations do not mutate registry', registry.list().length === 0);

    registry.register(' crm_api-1 ', async () => undefined);
    ok('normalized registered target is queryable', registry.isRegistered('CRM_API-1'));
    ok('unknown valid target returns no registration', registry.get('SMS') === null);
    const description = registry.get('crm_api-1');
    ok('registration lookup returns normalized identity', description?.targetSystem === 'CRM_API-1');
    ok('registration lookup reflects fail-closed policy', description?.policyAllowed === false && description.executionEnabled === false);

    rejects('duplicate normalized identity is rejected', () => registry.register('CRM_API-1', async () => undefined));
    ok('duplicate rejection preserves one registry entry', registry.list().length === 1);
  });

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
  }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    let calls = 0;

    registry.register('CRM', async () => { calls += 1; return { status: 'REJECTED', message: 'provider denied request' }; });
    const description = registry.get('CRM');
    ok('registry reflects enabled policy without granting it itself', description?.policyAllowed === true && description.executionEnabled === true);

    let classification = '';
    let retryable: boolean | undefined;
    try {
      await executor.execute({ jobId: 'phase5c2a-rejected', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });
    } catch (error: any) {
      classification = error?.classification;
      retryable = error?.retryable;
    }
    ok('adapter result remains classified by executor contract', classification === 'PERMANENT' && retryable === false);
    ok('registry does not bypass executor response validation', calls === 1);
  });

  console.log('Phase 5C.2A adapter contract hardening passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
