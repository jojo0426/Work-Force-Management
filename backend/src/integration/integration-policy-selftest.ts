import { IntegrationPolicyService } from './integration-policy.service';

function ok(name: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const keys = Object.keys(values);
  const before = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const key of keys) {
      const value = before.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function rejects(name: string, values: Record<string, string | undefined>, expected: string) {
  let message = '';
  try {
    withEnv(values, () => new IntegrationPolicyService());
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  ok(name, message.includes(expected));
}

function main() {
  console.log('\n=== PHASE 5C.1A INTEGRATION SAFETY POLICY FOUNDATION ===');

  withEnv({
    INTEGRATION_EXECUTION_ENABLED: undefined,
    INTEGRATION_ALLOWED_TARGETS: undefined,
    INTEGRATION_EXECUTION_TIMEOUT_MS: undefined,
    INTEGRATION_RETRY_DELAY_MS: undefined,
  }, () => {
    const policy = new IntegrationPolicyService().getPolicy();
    ok('external execution defaults disabled', policy.executionEnabled === false);
    ok('target allow-list defaults empty', policy.allowedTargets.length === 0);
    ok('execution timeout defaults to 30 seconds', policy.executionTimeoutMs === 30_000);
    ok('retry delay defaults to 30 seconds', policy.retryDelayMs === 30_000);
  });

  withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: ' billing, sms, BILLING ',
    INTEGRATION_EXECUTION_TIMEOUT_MS: '45000',
    INTEGRATION_RETRY_DELAY_MS: '60000',
  }, () => {
    const service = new IntegrationPolicyService();
    const policy = service.getPolicy();
    ok('explicit execution flag is parsed', policy.executionEnabled === true);
    ok('targets are normalized and deduplicated', policy.allowedTargets.join(',') === 'BILLING,SMS');
    ok('target lookup is normalized', service.isTargetAllowed(' billing ') === true);
    ok('unlisted target remains denied', service.isTargetAllowed('PAYMENT') === false);
    ok('explicit execution timeout is parsed', policy.executionTimeoutMs === 45_000);
    ok('explicit retry delay is parsed', policy.retryDelayMs === 60_000);
  });

  rejects('invalid execution flag fails closed', { INTEGRATION_EXECUTION_ENABLED: 'yes' }, 'must be true or false');
  rejects('invalid target fails closed', { INTEGRATION_ALLOWED_TARGETS: 'BILLING, bad target' }, 'Invalid integration target');
  rejects('zero timeout is rejected', { INTEGRATION_EXECUTION_TIMEOUT_MS: '0' }, 'positive integer');
  rejects('fractional retry delay is rejected', { INTEGRATION_RETRY_DELAY_MS: '1.5' }, 'positive integer');

  console.log('Phase 5C.1A integration safety policy foundation passed.');
}

main();
