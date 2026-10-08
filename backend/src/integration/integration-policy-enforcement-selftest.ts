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

async function withEnv(
  values: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const before = new Map(POLICY_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of POLICY_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fn();
  } finally {
    for (const key of POLICY_ENV_KEYS) {
      const value = before.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main() {
  console.log('\n=== PHASE 5C.1B POLICY ENFORCEMENT BOUNDARY ===');

  const context = {
    jobId: 'policy-job-1',
    sourceSystem: 'WFM',
    targetSystem: 'CRM',
    payload: { workOrderId: 'wo-policy-1' },
  };

  await withEnv({}, async () => {
    let calls = 0;
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('CRM', async () => { calls += 1; });
    executor.allowTarget('CRM');
    executor.setExecutionEnabled(true);

    const result = await executor.execute(context);
    ok('default policy blocks execution despite mutable executor enablement', result.status === 'BLOCKED' && result.reason === 'EXECUTION_DISABLED');
    ok('default policy prevents adapter invocation', calls === 0 && result.externalActionsExecuted === false);
  });

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'BILLING',
  }, async () => {
    let calls = 0;
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('CRM', async () => { calls += 1; });
    executor.allowTarget('CRM');
    executor.setExecutionEnabled(true);

    const result = await executor.execute(context);
    ok('policy allow-list blocks target absent from configuration', result.status === 'BLOCKED' && result.reason === 'TARGET_NOT_ALLOWED');
    ok('blocked policy target invokes no adapter', calls === 0 && result.externalActionsExecuted === false);
  });

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'crm',
    INTEGRATION_EXECUTION_TIMEOUT_MS: '30000',
  }, async () => {
    let calls = 0;
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('CRM', async () => { calls += 1; return { status: 'SUCCESS' }; });

    const result = await executor.execute(context);
    ok('explicit enabled policy and allow-listed target permit controlled adapter', result.status === 'EXECUTED');
    ok('policy-authorized adapter executes exactly once', calls === 1);
    ok('successful policy boundary reports external action execution', result.externalActionsExecuted === true);
  });

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'false',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
  }, async () => {
    let calls = 0;
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('CRM', async () => { calls += 1; });
    executor.setExecutionEnabled(true);
    executor.allowTarget('CRM');

    const result = await executor.execute(context);
    ok('explicit disabled policy cannot be overridden by legacy setters', result.status === 'BLOCKED' && result.reason === 'EXECUTION_DISABLED');
    ok('legacy setters cannot bypass policy boundary', calls === 0);
  });

  console.log('Phase 5C.1B integration policy enforcement boundary passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
