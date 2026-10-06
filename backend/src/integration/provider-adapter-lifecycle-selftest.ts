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

function provider(targetSystem: string, providerName: string, execute: ProviderAdapter['execute']): ProviderAdapter {
  return { descriptor: { targetSystem, providerName, externalExecution: true }, execute };
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
  console.log('\n=== PHASE 5C.3B PROVIDER LIFECYCLE BOUNDARY ===');

  await withEnv({}, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    const lifecycle = new IntegrationAdapterLifecycleService(registry);
    let crmCalls = 0;
    let smsCalls = 0;

    const definitions = [
      providerAdapterDefinition(provider('CRM', 'CRM Provider', async () => {
        crmCalls += 1;
        return { status: 'SUCCESS' };
      })),
      providerAdapterDefinition(provider('SMS', 'SMS Provider', async () => {
        smsCalls += 1;
        return { status: 'SUCCESS' };
      })),
    ];

    ok('provider definitions execute no actions before lifecycle initialization', crmCalls === 0 && smsCalls === 0);
    lifecycle.initialize(definitions);
    ok('provider lifecycle initializes exactly once', lifecycle.getStatus().initialized === true);
    ok('provider lifecycle registers all controlled providers', registry.isRegistered('CRM') && registry.isRegistered('SMS'));
    ok('provider lifecycle initialization executes no provider', crmCalls === 0 && smsCalls === 0);

    const crmBlocked = await executor.execute({ jobId: 'phase5c3b-crm', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });
    const smsBlocked = await executor.execute({ jobId: 'phase5c3b-sms', sourceSystem: 'WFM', targetSystem: 'SMS', payload: {} });
    ok('default policy blocks every lifecycle provider', crmBlocked.status === 'BLOCKED' && smsBlocked.status === 'BLOCKED');
    ok('blocked lifecycle providers remain uninvoked', crmCalls === 0 && smsCalls === 0);
    rejects('provider lifecycle cannot be initialized twice', () => lifecycle.initialize(definitions));
  });

  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'CRM' }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    const lifecycle = new IntegrationAdapterLifecycleService(registry);
    let crmCalls = 0;
    let smsCalls = 0;

    lifecycle.initialize([
      providerAdapterDefinition(provider('CRM', 'CRM Provider', async () => {
        crmCalls += 1;
        return { status: 'SUCCESS' };
      })),
      providerAdapterDefinition(provider('SMS', 'SMS Provider', async () => {
        smsCalls += 1;
        return { status: 'SUCCESS' };
      })),
    ]);

    const crm = await executor.execute({ jobId: 'phase5c3b-authorized', sourceSystem: 'WFM', targetSystem: 'CRM', payload: {} });
    const sms = await executor.execute({ jobId: 'phase5c3b-denied', sourceSystem: 'WFM', targetSystem: 'SMS', payload: {} });
    ok('allow-listed lifecycle provider executes through executor', crm.status === 'EXECUTED' && crm.externalActionsExecuted === true);
    ok('allow-listed lifecycle provider executes exactly once', crmCalls === 1);
    ok('non-allow-listed lifecycle provider remains blocked', sms.status === 'BLOCKED' && sms.reason === 'TARGET_NOT_ALLOWED');
    ok('non-allow-listed lifecycle provider remains uninvoked', smsCalls === 0);
  });

  await withEnv({}, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const registry = new IntegrationAdapterRegistryService(executor, policy);
    const lifecycle = new IntegrationAdapterLifecycleService(registry);
    const duplicateDefinitions = [
      providerAdapterDefinition(provider(' crm ', 'CRM Primary', async () => undefined)),
      providerAdapterDefinition(provider('CRM', 'CRM Duplicate', async () => undefined)),
    ];

    rejects('duplicate normalized provider targets fail before lifecycle mutation', () => lifecycle.initialize(duplicateDefinitions));
    ok('duplicate provider failure leaves registry untouched', registry.listRegistrations().length === 0);
    ok('duplicate provider failure leaves lifecycle uninitialized', lifecycle.getStatus().initialized === false);
  });

  console.log('Phase 5C.3B provider lifecycle boundary passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
