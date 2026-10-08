import { IntegrationExecutionError, IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';

// Mock-only provider connectivity contract. No credentials, sockets, or external requests.
const keys = ['INTEGRATION_EXECUTION_ENABLED', 'INTEGRATION_ALLOWED_TARGETS', 'INTEGRATION_EXECUTION_TIMEOUT_MS'] as const;
function ok(label: string, valid: boolean): void {
  if (!valid) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function withEnv(values: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const saved = keys.map(key => [key, process.env[key]] as const);
  try {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    await fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
async function main(): Promise<void> {
  console.log('=== PHASE 5D.2 MOCK PROVIDER CONNECTIVITY CONTRACT ===');
  const context = { jobId: 'mock-connectivity-1', sourceSystem: 'WFM', targetSystem: 'SANDBOX', payload: { action: 'PING' } };
  await withEnv({}, async () => {
    let calls = 0;
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('SANDBOX', () => { calls++; return { status: 'SUCCESS' }; });
    const result = await executor.execute(context);
    ok('default disabled blocks mock provider', result.status === 'BLOCKED' && calls === 0);
  });
  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'SANDBOX' }, async () => {
    const cases = [
      { name: 'success', response: { status: 'SUCCESS' } as const, classification: null, retryable: false },
      { name: 'authentication rejection', response: { status: 'REJECTED', message: 'mock unauthorized' } as const, classification: 'PERMANENT', retryable: false },
      { name: 'rate limit', response: { status: 'RETRYABLE_FAILURE', message: 'mock rate limited' } as const, classification: 'TRANSIENT', retryable: true },
      { name: 'malformed response', response: { status: 'UNKNOWN' }, classification: 'INVALID_RESPONSE', retryable: false },
    ];
    for (const test of cases) {
      let calls = 0;
      const executor = new IntegrationExecutorService(new IntegrationPolicyService());
      executor.registerAdapter('SANDBOX', () => { calls++; return test.response as any; });
      try {
        const result = await executor.execute(context);
        ok(test.name + ' succeeds', test.classification === null && result.status === 'EXECUTED');
      } catch (error) {
        ok(test.name + ' classified', error instanceof IntegrationExecutionError &&
          error.classification === test.classification && error.retryable === test.retryable);
      }
      ok(test.name + ' exactly one invocation', calls === 1);
    }
    let calls = 0;
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('SANDBOX', () => { calls++; throw new Error('mock network outage'); });
    try {
      await executor.execute(context);
      throw new Error('Expected network failure');
    } catch (error) {
      ok('network outage classified transient', error instanceof IntegrationExecutionError &&
        error.classification === 'TRANSIENT' && error.retryable);
    }
    ok('network outage single attempt', calls === 1);
  });
  console.log('Phase 5D.2 mock provider connectivity contract passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
