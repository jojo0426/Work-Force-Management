import { IntegrationHealthMetricsService } from './integration-health-metrics.service';

function ok(label: string, valid: boolean): void {
  if (!valid) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
function main(): void {
  console.log('=== PHASE 5D.3 PRIVACY-SAFE INTEGRATION MONITORING ===');
  const metrics = new IntegrationHealthMetricsService();
  const initial = metrics.snapshot();
  ok('starts with no events or alerts', initial.total === 0 && initial.alerts.length === 0);
  metrics.record('EXECUTED');
  metrics.record('BLOCKED');
  metrics.record('TRANSIENT');
  metrics.record('PERMANENT');
  metrics.record('INVALID_RESPONSE');
  metrics.record('TIMEOUT');
  metrics.record('TIMEOUT');
  metrics.record('TIMEOUT');
  const snapshot = metrics.snapshot(5, 3);
  ok('counts outcomes accurately', snapshot.total === 8 && snapshot.counts.EXECUTED === 1 && snapshot.counts.BLOCKED === 1);
  ok('failure threshold triggers', snapshot.alerts.includes('FAILURE_THRESHOLD'));
  ok('timeout threshold triggers', snapshot.alerts.includes('TIMEOUT_THRESHOLD'));
  const serialized = JSON.stringify(snapshot);
  ok('snapshot includes no subscriber or job identity', !serialized.includes('subscriber') && !serialized.includes('jobId') && !serialized.includes('payload'));
  const changed = metrics.snapshot();
  (changed.counts as any).TIMEOUT = 999;
  ok('snapshot mutations do not change stored counters', metrics.snapshot().counts.TIMEOUT === 3);
  let rejected = false;
  try { metrics.record('secret-token' as any); } catch (error) {
    rejected = error instanceof Error && error.message === 'Invalid integration outcome';
  }
  ok('unknown outcome rejected without echoing input', rejected);
  let invalidThreshold = false;
  try { metrics.snapshot(0); } catch { invalidThreshold = true; }
  ok('invalid alert thresholds rejected', invalidThreshold);
  console.log('Phase 5D.3 monitoring baseline passed.');
}
main();
