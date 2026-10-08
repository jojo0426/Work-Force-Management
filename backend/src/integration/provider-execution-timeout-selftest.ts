import {
  IntegrationExecutionError,
  IntegrationExecutorService,
} from './integration-executor.service';
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
  console.log('\n=== PHASE 5C.4A PROVIDER EXECUTION TIMEOUT BOUNDARY ===');

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
    INTEGRATION_EXECUTION_TIMEOUT_MS: '25',
  }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    let calls = 0;
    let completed = false;

    executor.registerAdapter('CRM', async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 75));
      completed = true;
      return { status: 'SUCCESS' };
    });

    let timeoutError: IntegrationExecutionError | undefined;
    try {
      await executor.execute({
        jobId: 'phase5c4a-timeout',
        sourceSystem: 'WFM',
        targetSystem: 'CRM',
        payload: { case: 'timeout' },
      });
    } catch (error) {
      if (error instanceof IntegrationExecutionError) timeoutError = error;
      else throw error;
    }

    ok('slow provider rejects through execution error boundary', timeoutError instanceof IntegrationExecutionError);
    ok('slow provider is classified TIMEOUT', timeoutError?.classification === 'TIMEOUT');
    ok('provider timeout remains retryable', timeoutError?.retryable === true);
    ok('provider timeout invokes one controlled attempt', calls === 1);
    ok('timeout returns before slow provider completes', completed === false);
  });

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
    INTEGRATION_EXECUTION_TIMEOUT_MS: '100',
  }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    let calls = 0;

    executor.registerAdapter('CRM', async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { status: 'SUCCESS' };
    });

    const result = await executor.execute({
      jobId: 'phase5c4a-within-timeout',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: { case: 'within-timeout' },
    });

    ok('provider within timeout executes successfully', result.status === 'EXECUTED');
    ok('provider within timeout reports external execution', result.externalActionsExecuted === true);
    ok('provider within timeout executes exactly once', calls === 1);
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
      jobId: 'phase5c4a-disabled',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: {},
    });

    ok('timeout hardening preserves default fail-closed policy', result.status === 'BLOCKED');
    ok('blocked provider remains uninvoked', calls === 0);
  });

  console.log('Phase 5C.4A provider execution timeout boundary passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
