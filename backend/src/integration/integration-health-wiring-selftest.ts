import { IntegrationExecutorService, IntegrationExecutionError } from './integration-executor.service';
import { IntegrationHealthMetricsService } from './integration-health-metrics.service';
import { IntegrationPolicyService } from './integration-policy.service';

const keys = ['INTEGRATION_EXECUTION_ENABLED', 'INTEGRATION_ALLOWED_TARGETS', 'INTEGRATION_EXECUTION_TIMEOUT_MS'] as const;
function ok(label: string, valid: boolean): void {
  if (!valid) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function withEnv(values: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const before = keys.map(key => [key, process.env[key]] as const);
  try {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    await fn();
  } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
async function main(): Promise<void> {
  console.log('=== PHASE 5D.3B EXECUTION MONITORING INTEGRATION ===');
  const metrics = new IntegrationHealthMetricsService();
  const context = { jobId: 'private-job-123', sourceSystem: 'WFM', targetSystem: 'SANDBOX', payload: { subscriber: 'private-subscriber' } };
  await withEnv({}, async () => {
    let calls = 0;
    const executor = new IntegrationExecutorService(new IntegrationPolicyService(), metrics);
    executor.registerAdapter('SANDBOX', () => { calls++; return { status: 'SUCCESS' }; });
    const result = await executor.execute(context);
    ok('disabled execution is blocked', result.status === 'BLOCKED' && calls === 0);
    ok('blocked execution counted', metrics.snapshot().counts.BLOCKED === 1);
  });
  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'SANDBOX', INTEGRATION_EXECUTION_TIMEOUT_MS: '20' }, async () => {
    const cases = [
      { label: 'success', adapter: () => ({ status: 'SUCCESS' as const }), expected: 'EXECUTED' },
      { label: 'permanent', adapter: () => ({ status: 'REJECTED' as const, message: 'private-provider-response' }), expected: 'PERMANENT' },
      { label: 'transient', adapter: () => { throw new Error('private-token'); }, expected: 'TRANSIENT' },
      { label: 'invalid', adapter: () => ({ status: 'UNKNOWN' } as any), expected: 'INVALID_RESPONSE' },
      { label: 'timeout', adapter: () => new Promise<never>(() => {}), expected: 'TIMEOUT' },
    ];
    for (const test of cases) {
      const executor = new IntegrationExecutorService(new IntegrationPolicyService(), metrics);
      executor.registerAdapter('SANDBOX', test.adapter);
      try { await executor.execute(context); }
      catch (error) {
        ok(test.label + ' expected classified error', error instanceof IntegrationExecutionError && error.classification === test.expected);
      }
      ok(test.label + ' counted once', metrics.snapshot().counts[test.expected as keyof ReturnType<typeof metrics.snapshot>['counts']] === 1);
    }
    const missing = new IntegrationExecutorService(new IntegrationPolicyService(), metrics);
    try { await missing.execute(context); } catch (error) {
      ok('missing adapter fails permanent', error instanceof IntegrationExecutionError && error.classification === 'PERMANENT');
    }
    ok('missing adapter counted once', metrics.snapshot().counts.PERMANENT === 2);
  });
  const snapshot = metrics.snapshot(4, 1);
  ok('alert thresholds reflect actual execution failures', snapshot.alerts.includes('FAILURE_THRESHOLD') && snapshot.alerts.includes('TIMEOUT_THRESHOLD'));
  const serialized = JSON.stringify(snapshot);
  ok('metrics omit job payload and provider diagnostics', !serialized.includes('private-job') && !serialized.includes('private-subscriber') && !serialized.includes('private-token') && !serialized.includes('private-provider-response'));
  console.log('Phase 5D.3B execution monitoring integration passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
