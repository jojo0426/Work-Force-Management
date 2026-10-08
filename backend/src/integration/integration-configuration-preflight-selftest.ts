import { IntegrationPolicyService } from './integration-policy.service';

// Phase 5D.1 preflight regression: never enable external execution implicitly.
// This selftest deliberately avoids live provider credentials or network calls.
const keys = [
  'INTEGRATION_EXECUTION_ENABLED',
  'INTEGRATION_ALLOWED_TARGETS',
  'INTEGRATION_EXECUTION_TIMEOUT_MS',
  'INTEGRATION_RETRY_DELAY_MS',
] as const;

function assert(label: string, condition: boolean): void {
  if (!condition) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}

function withPolicyEnv(values: Record<string, string | undefined>, fn: () => void): void {
  const saved = keys.map(key => [key, process.env[key]] as const);
  try {
    for (const key of keys) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined) process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function expectRejected(label: string, values: Record<string, string>, expected: string): void {
  let message = '';
  withPolicyEnv(values, () => {
    try { new IntegrationPolicyService(); }
    catch (error) { message = error instanceof Error ? error.message : String(error); }
  });
  assert(label, message.includes(expected));
  assert(label + ' does not leak configured value', !message.includes('sensitive-example-token'));
}

function main(): void {
  console.log('=== PHASE 5D.1 CONFIGURATION PREFLIGHT BASELINE ===');
  withPolicyEnv({}, () => {
    const policy = new IntegrationPolicyService().getPolicy();
    assert('default external execution disabled', !policy.executionEnabled);
    assert('default allowlist empty', policy.allowedTargets.length === 0);
  });
  withPolicyEnv({ INTEGRATION_ALLOWED_TARGETS: 'BILLING' }, () => {
    const policy = new IntegrationPolicyService().getPolicy();
    assert('allowlist alone does not enable execution', !policy.executionEnabled);
  });
  withPolicyEnv({ INTEGRATION_EXECUTION_ENABLED: 'false', INTEGRATION_ALLOWED_TARGETS: 'BILLING' }, () => {
    const policy = new IntegrationPolicyService().getPolicy();
    assert('explicit disable overrides configured targets', !policy.executionEnabled);
  });
  expectRejected('malformed enable flag rejected', { INTEGRATION_EXECUTION_ENABLED: 'sensitive-example-token' }, 'must be true or false');
  expectRejected('invalid timeout rejected', { INTEGRATION_EXECUTION_TIMEOUT_MS: '0' }, 'positive safe integer');
  expectRejected('invalid retry rejected', { INTEGRATION_RETRY_DELAY_MS: '-1' }, 'positive integer');
  console.log('Phase 5D.1 configuration preflight baseline passed.');
}

main();
