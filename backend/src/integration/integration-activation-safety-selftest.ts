import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';

const keys = ['INTEGRATION_EXECUTION_ENABLED', 'INTEGRATION_ALLOWED_TARGETS', 'INTEGRATION_EXECUTION_TIMEOUT_MS'] as const;
function ok(name: string, valid: boolean): void {
  if (!valid) throw new Error('FAIL: ' + name);
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
  console.log('=== PHASE 5D.4 CONTROLLED ACTIVATION AND KILL SWITCH ===');
  const context = { jobId: 'controlled-activation', sourceSystem: 'WFM', targetSystem: 'SANDBOX', payload: {} };
  await withEnv({}, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    let calls = 0;
    executor.registerAdapter('SANDBOX', () => { calls++; return { status: 'SUCCESS' }; });
    ok('default policy is disabled', !policy.getPolicy().executionEnabled);
    ok('default blocked without provider invocation', (await executor.execute(context)).status === 'BLOCKED' && calls === 0);
  });
  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'SANDBOX' }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    let calls = 0;
    executor.registerAdapter('SANDBOX', () => { calls++; return { status: 'SUCCESS' }; });
    ok('explicit allowlisted sandbox can execute', (await executor.execute(context)).status === 'EXECUTED' && calls === 1);
    policy.emergencyStop();
    ok('emergency stop disables effective execution', policy.isEmergencyStopped() && !policy.getPolicy().executionEnabled);
    const blocked = await executor.execute(context);
    ok('emergency stop blocks subsequent attempts', blocked.status === 'BLOCKED' && blocked.reason === 'EXECUTION_DISABLED' && calls === 1);
    policy.emergencyStop();
    executor.setExecutionEnabled(true);
    executor.allowTarget('SANDBOX');
    ok('legacy executor toggles cannot bypass emergency stop', (await executor.execute(context)).status === 'BLOCKED' && calls === 1);
    const copy = policy.getPolicy();
    (copy as any).executionEnabled = true;
    ok('policy snapshot mutation cannot re-enable execution', !policy.getPolicy().executionEnabled);
  });
  await withEnv({ INTEGRATION_EXECUTION_ENABLED: 'true', INTEGRATION_ALLOWED_TARGETS: 'CRM' }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    let calls = 0;
    executor.registerAdapter('SANDBOX', () => { calls++; return { status: 'SUCCESS' }; });
    const blocked = await executor.execute(context);
    ok('non-allowlisted target cannot execute', blocked.status === 'BLOCKED' && blocked.reason === 'TARGET_NOT_ALLOWED' && calls === 0);
  });
  console.log('Phase 5D.4 controlled activation baseline passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
