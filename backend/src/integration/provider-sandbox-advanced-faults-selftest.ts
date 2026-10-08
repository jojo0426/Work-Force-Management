import { IntegrationExecutionError, IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';

// Mock-only fault suite: does not contact an external provider.
const keys = ['INTEGRATION_EXECUTION_ENABLED', 'INTEGRATION_ALLOWED_TARGETS', 'INTEGRATION_EXECUTION_TIMEOUT_MS'] as const;
function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
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
  console.log('=== PHASE 5D.2B MOCK PROVIDER ADVANCED FAULTS ===');
  const context = { jobId: 'sandbox-stable-job', sourceSystem: 'WFM', targetSystem: 'SANDBOX', payload: { action: 'SYNC' } };
  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'SANDBOX', INTEGRATION_EXECUTION_TIMEOUT_MS: '30' }, async () => {
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    let calls = 0;
    let aborts = 0;
    let lateSideEffects = 0;
    executor.registerAdapter('SANDBOX', async ({ signal }) => {
      calls++;
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => { lateSideEffects++; resolve(); }, 100);
        signal?.addEventListener('abort', () => { aborts++; clearTimeout(timer); resolve(); }, { once: true });
      });
      return { status: 'SUCCESS' };
    });
    let timeout = false;
    try { await executor.execute(context); } catch (error) {
      timeout = error instanceof IntegrationExecutionError && error.classification === 'TIMEOUT' && error.retryable;
    }
    ok('timeout classified retryable', timeout);
    ok('abort delivered once to cooperative adapter', calls === 1 && aborts === 1);
    await new Promise(resolve => setTimeout(resolve, 110));
    ok('cooperative adapter avoids late side effect', lateSideEffects === 0);
  });
  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'SANDBOX' }, async () => {
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    const committed = new Set<string>();
    let attempts = 0;
    let effects = 0;
    executor.registerAdapter('SANDBOX', ({ jobId }) => {
      attempts++;
      if (!committed.has(jobId)) { committed.add(jobId); effects++; }
      return { status: 'SUCCESS' };
    });
    await Promise.all([executor.execute(context), executor.execute(context)]);
    await executor.execute(context);
    ok('duplicate deliveries preserve stable job identity', attempts === 3);
    ok('mock provider deduplicates side effects', effects === 1);
    await executor.execute({ ...context, jobId: 'sandbox-second-job' });
    ok('distinct job remains independently executable', effects === 2);
  });
  await withEnv({}, async () => {
    let calls = 0;
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('SANDBOX', () => { calls++; return { status: 'SUCCESS' }; });
    const result = await executor.execute(context);
    ok('default disabled policy blocks advanced fault adapter', result.status === 'BLOCKED' && calls === 0);
  });
  console.log('Phase 5D.2B mock provider advanced faults passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
