import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntegrationPolicyService } from './integration-policy.service';
import { IntegrationHealthMetricsService } from './integration-health-metrics.service';

function ok(label: string, valid: boolean): void {
  if (!valid) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
function main(): void {
  console.log('=== PHASE 5D.5 RELEASE ACCEPTANCE PREFLIGHT ===');
  const originalEnabled = process.env.INTEGRATION_EXECUTION_ENABLED;
  const originalTargets = process.env.INTEGRATION_ALLOWED_TARGETS;
  try {
    delete process.env.INTEGRATION_EXECUTION_ENABLED;
    delete process.env.INTEGRATION_ALLOWED_TARGETS;
    const policy = new IntegrationPolicyService();
    ok('baseline remains fail-closed', !policy.getPolicy().executionEnabled && policy.getPolicy().allowedTargets.length === 0);
    policy.emergencyStop();
    ok('emergency stop remains one-way', policy.isEmergencyStopped() && !policy.getPolicy().executionEnabled);
    const metrics = new IntegrationHealthMetricsService();
    metrics.record('TIMEOUT');
    ok('timeout alert available without provider data', metrics.snapshot(5, 1).alerts.includes('TIMEOUT_THRESHOLD'));
    const scripts = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')).scripts as Record<string, string>;
    const required = [
      'test:security', 'test:phase5c', 'test:phase5c-database',
      'test:phase5d-config', 'test:phase5d-sandbox', 'test:phase5d-faults',
      'test:phase5d-monitoring', 'test:phase5d-monitoring-wiring',
      'test:phase5d-activation', 'test:database-e2e',
    ];
    ok('release regression commands are registered', required.every(name => typeof scripts[name] === 'string' && scripts[name].length > 0));
    const workflow = readFileSync(join(__dirname, '../../../.github/workflows/baseline.yml'), 'utf8');
    ok('CI gates Phase 5C database safety', workflow.includes('npm run test:phase5c-database'));
    ok('CI gates Phase 5D activation and monitoring', workflow.includes('npm run test:phase5d-activation') && workflow.includes('npm run test:phase5d-monitoring-wiring'));
    ok('CI gates backend and web production audits', (workflow.match(/npm audit --omit=dev --audit-level=high/g) || []).length >= 2);
    ok('mobile audit is explicitly non-blocking', workflow.includes('npm audit --omit=dev --audit-level=high || true'));
    const runbook = readFileSync(join(__dirname, '../../../docs/phase-5d4-activation-recovery-runbook.md'), 'utf8');
    ok('rollback runbook documents emergency stop', runbook.includes('emergencyStop()') && runbook.includes('INTEGRATION_EXECUTION_ENABLED=false'));
    const acceptance = readFileSync(join(__dirname, '../../../docs/phase-5d5-release-acceptance.md'), 'utf8');
    ok('release acceptance requires operator sign-off', acceptance.includes('NOT APPROVED') && acceptance.includes('Operator approval'));
  } finally {
    if (originalEnabled === undefined) delete process.env.INTEGRATION_EXECUTION_ENABLED;
    else process.env.INTEGRATION_EXECUTION_ENABLED = originalEnabled;
    if (originalTargets === undefined) delete process.env.INTEGRATION_ALLOWED_TARGETS;
    else process.env.INTEGRATION_ALLOWED_TARGETS = originalTargets;
  }
  console.log('Phase 5D.5 release acceptance preflight passed (not production authorization).');
}
main();
