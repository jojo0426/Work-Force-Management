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

function provider(targetSystem: string, providerName: string, execute: ProviderAdapter['execute']): ProviderAdapter {
  return { descriptor: { targetSystem, providerName, externalExecution: true }, execute };
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.3A PROVIDER ADAPTER CONTRACT HARDENING ===');

  rejects('empty provider target is rejected', () => providerAdapterDefinition(provider('', 'Provider', async () => undefined)));
  rejects('whitespace provider target is rejected', () => providerAdapterDefinition(provider('   ', 'Provider', async () => undefined)));
  rejects('path-like provider target is rejected', () => providerAdapterDefinition(provider('../CRM', 'Provider', async () => undefined)));
  rejects('malformed provider target is rejected', () => providerAdapterDefinition(provider('CRM PROD!', 'Provider', async () => undefined)));
  rejects('empty provider name is rejected', () => providerAdapterDefinition(provider('CRM', '', async () => undefined)));
  rejects('whitespace provider name is rejected', () => providerAdapterDefinition(provider('CRM', '   ', async () => undefined)));
  rejects('missing external boundary declaration is rejected', () => providerAdapterDefinition({
    descriptor: { targetSystem: 'CRM', providerName: 'Provider', externalExecution: false as true },
    execute: async () => undefined,
  }));
  rejects('missing provider execute function is rejected', () => providerAdapterDefinition({
    descriptor: { targetSystem: 'CRM', providerName: 'Provider', externalExecution: true },
    execute: undefined as any,
  }));

  let definitionCalls = 0;
  const definition = providerAdapterDefinition(provider(' crm ', 'CRM Provider', async () => {
    definitionCalls += 1;
    return { status: 'SUCCESS' };
  }));
  ok('provider definition target is canonical', definition.targetSystem === 'CRM');
  ok('provider definition creation has no execution side effect', definitionCalls === 0);

  await withEnv({}, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    const lifecycle = new IntegrationAdapterLifecycleService(registry);
    let calls = 0;

    lifecycle.initialize([providerAdapterDefinition(provider('CRM', 'CRM Provider', async () => {
      calls += 1;
      return { status: 'SUCCESS' };
    }))]);
    ok('provider lifecycle registration has no execution side effect', calls === 0);

    const blocked = await executor.execute({ jobId: 'phase5c3a-blocked', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });
    ok('default fail-closed policy remains authoritative', blocked.status === 'BLOCKED' && blocked.reason === 'EXECUTION_DISABLED');
    ok('blocked provider remains uninvoked', calls === 0);
  });

  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'CRM' }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    const lifecycle = new IntegrationAdapterLifecycleService(registry);
    let calls = 0;
    let seenTarget = '';

    lifecycle.initialize([providerAdapterDefinition(provider('crm', 'CRM Provider', async (context) => {
      calls += 1;
      seenTarget = context.targetSystem;
      return { status: 'SUCCESS' };
    }))]);

    const result = await executor.execute({ jobId: 'phase5c3a-authorized', sourceSystem: 'WFM', targetSystem: 'crm', payload: {} });
    ok('authorized provider still executes only through executor boundary', result.status === 'EXECUTED' && result.externalActionsExecuted === true);
    ok('authorized provider executes exactly once', calls === 1);
    ok('provider receives canonical target from executor', seenTarget === 'CRM');
  });

  console.log('Phase 5C.3A provider adapter contract hardening passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
