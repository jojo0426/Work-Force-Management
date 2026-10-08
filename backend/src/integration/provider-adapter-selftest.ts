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

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.3 CONTROLLED PROVIDER ADAPTER FOUNDATION ===');

  const before = new Map(POLICY_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of POLICY_ENV_KEYS) delete process.env[key];

    let calls = 0;
    const provider: ProviderAdapter = {
      descriptor: {
        targetSystem: ' crm ',
        providerName: 'Controlled CRM Test Provider',
        externalExecution: true,
      },
      execute: async (context) => {
        calls += 1;
        ok('provider receives durable job identity', context.jobId === 'phase5c3-job');
        ok('provider receives normalized target identity', context.targetSystem === 'CRM');
        return { status: 'SUCCESS' };
      },
    };

    const definition = providerAdapterDefinition(provider);
    ok('provider factory normalizes target identity', definition.targetSystem === 'CRM');
    ok('provider definition creation executes no external action', calls === 0);

    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    const lifecycle = new IntegrationAdapterLifecycleService(registry);
    lifecycle.initialize([definition]);

    ok('provider registration executes no external action', calls === 0);
    ok('provider registers through lifecycle and registry', registry.isRegistered('CRM'));

    const blocked = await executor.execute({
      jobId: 'phase5c3-job',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: { controlled: true },
    });
    ok('default policy blocks concrete provider adapter', blocked.status === 'BLOCKED' && blocked.reason === 'EXECUTION_DISABLED');
    ok('blocked concrete provider adapter is never invoked', calls === 0);

    rejects('provider without name is rejected', () => providerAdapterDefinition({
      descriptor: { targetSystem: 'CRM', providerName: '', externalExecution: true },
      execute: async () => undefined,
    }));
    rejects('provider with malformed target is rejected', () => providerAdapterDefinition({
      descriptor: { targetSystem: '../CRM', providerName: 'Bad target', externalExecution: true },
      execute: async () => undefined,
    }));
    rejects('provider without execute function is rejected', () => providerAdapterDefinition({
      descriptor: { targetSystem: 'CRM', providerName: 'No execute', externalExecution: true },
      execute: null as any,
    }));

    console.log('Phase 5C.3 controlled provider adapter foundation passed.');
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
