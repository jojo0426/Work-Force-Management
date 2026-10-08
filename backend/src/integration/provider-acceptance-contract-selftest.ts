import { IntegrationExecutionError, IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';
import { createMockAcceptanceAdapter, MOCK_PROVIDER_ACCEPTANCE, MockProviderOutcome } from './provider-acceptance-contract';

const keys = ['INTEGRATION_EXECUTION_ENABLED', 'INTEGRATION_ALLOWED_TARGETS'] as const;
function check(name: string, condition: boolean): void {
  if (!condition) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function withEnv(values: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved = keys.map(key => [key, process.env[key]] as const);
  try {
    for (const key of keys) delete process.env[key];
    Object.entries(values).forEach(([key, value]) => { process.env[key] = value; });
    await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
async function main(): Promise<void> {
  console.log('=== PHASE 5E.1 MOCK PROVIDER ACCEPTANCE ===');
  check('profile is mock-only and in-memory', MOCK_PROVIDER_ACCEPTANCE.environment === 'MOCK' && MOCK_PROVIDER_ACCEPTANCE.endpoint === 'in-memory');
  check('idempotency contract uses durable job identity', MOCK_PROVIDER_ACCEPTANCE.idempotency === 'jobId');
  const context = { jobId: 'synthetic-job-1', sourceSystem: 'WFM', targetSystem: 'SANDBOX', payload: { action: 'PING' } };
  await withEnv({}, async () => {
    const observed: string[] = [];
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('SANDBOX', createMockAcceptanceAdapter('SUCCESS', observed));
    check('default execution blocked', (await executor.execute(context)).status === 'BLOCKED' && observed.length === 0);
  });
  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'SANDBOX' }, async () => {
    const cases: Array<{ outcome: MockProviderOutcome; classification: string | null; retryable: boolean }> = [
      { outcome: 'SUCCESS', classification: null, retryable: false },
      { outcome: 'RATE_LIMIT', classification: 'TRANSIENT', retryable: true },
      { outcome: 'UNAVAILABLE', classification: 'TRANSIENT', retryable: true },
      { outcome: 'UNAUTHORIZED', classification: 'PERMANENT', retryable: false },
      { outcome: 'INVALID_REQUEST', classification: 'PERMANENT', retryable: false },
    ];
    for (const test of cases) {
      const observed: string[] = [];
      const executor = new IntegrationExecutorService(new IntegrationPolicyService());
      executor.registerAdapter('SANDBOX', createMockAcceptanceAdapter(test.outcome, observed));
      if (test.classification === null) {
        check(test.outcome + ' accepted', (await executor.execute(context)).status === 'EXECUTED');
      } else {
        try {
          await executor.execute(context);
          throw new Error('Expected mock rejection');
        } catch (error) {
          check(test.outcome + ' classified correctly', error instanceof IntegrationExecutionError &&
            error.classification === test.classification && error.retryable === test.retryable);
        }
      }
      check(test.outcome + ' carries stable jobId once', observed.length === 1 && observed[0] === context.jobId);
    }
    const policy = new IntegrationPolicyService();
    const observed: string[] = [];
    const executor = new IntegrationExecutorService(policy);
    executor.registerAdapter('SANDBOX', createMockAcceptanceAdapter('SUCCESS', observed));
    policy.emergencyStop();
    check('emergency stop prevents mock invocation', (await executor.execute(context)).status === 'BLOCKED' && observed.length === 0);
  });
  console.log('Phase 5E.1 mock provider acceptance passed. No outbound requests.');
}
main().catch(error => { console.error(error); process.exit(1); });
