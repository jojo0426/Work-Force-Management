import 'reflect-metadata';
import { IntegrationAdapterLifecycleService } from './integration-adapter-lifecycle.service';
import { IntegrationAdapterRegistryService } from './integration-adapter-registry.service';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationModule } from './integration.module';
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

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.2B ADAPTER LIFECYCLE / REGISTRATION WIRING ===');

  const before = new Map(POLICY_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of POLICY_ENV_KEYS) delete process.env[key];

    const providers: unknown[] = Reflect.getMetadata('providers', IntegrationModule) ?? [];
    ok('production IntegrationModule provides adapter registry', providers.includes(IntegrationAdapterRegistryService));
    ok('production IntegrationModule provides adapter lifecycle service', providers.includes(IntegrationAdapterLifecycleService));

    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    const lifecycle = new IntegrationAdapterLifecycleService(registry);
    let crmCalls = 0;
    let smsCalls = 0;

    ok('lifecycle starts uninitialized', lifecycle.isInitialized() === false);
    const registrations = lifecycle.initialize([
      { targetSystem: ' sms ', adapter: async () => { smsCalls += 1; } },
      { targetSystem: 'crm', adapter: async () => { crmCalls += 1; } },
    ]);

    ok('lifecycle initializes exactly once', lifecycle.isInitialized() === true);
    ok('startup registration registers every definition', registrations.length === 2 && registry.list().length === 2);
    ok('startup registration normalizes provider identities', registry.isRegistered('SMS') && registry.isRegistered('CRM'));
    ok('startup registration performs no adapter execution', crmCalls === 0 && smsCalls === 0);
    ok('registered startup adapters remain blocked by default policy', registrations.every((item) => !item.executionEnabled && !item.policyAllowed));

    const blocked = await executor.execute({ jobId: 'phase5c2b', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });
    ok('lifecycle wiring cannot bypass fail-closed executor policy', blocked.status === 'BLOCKED' && blocked.reason === 'EXECUTION_DISABLED');
    ok('blocked execution invokes no startup adapter', crmCalls === 0 && smsCalls === 0);

    rejects('second lifecycle initialization is rejected', () => lifecycle.initialize([]));

    const duplicatePolicy = new IntegrationPolicyService();
    const duplicateExecutor = new IntegrationExecutorService(duplicatePolicy);
    const duplicateRegistry = new IntegrationAdapterRegistryService(duplicateExecutor, duplicatePolicy);
    const duplicateLifecycle = new IntegrationAdapterLifecycleService(duplicateRegistry);
    rejects('duplicate normalized startup definitions fail before registration', () => duplicateLifecycle.initialize([
      { targetSystem: 'CRM', adapter: async () => undefined },
      { targetSystem: ' crm ', adapter: async () => undefined },
    ]));
    ok('duplicate startup failure leaves registry untouched', duplicateRegistry.list().length === 0 && !duplicateLifecycle.isInitialized());

    console.log('Phase 5C.2B adapter lifecycle / registration wiring passed.');
  } finally {
    for (const key of POLICY_ENV_KEYS) {
      const value = before.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
