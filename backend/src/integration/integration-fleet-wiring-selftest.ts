import { IntegrationWorkerService } from './integration-worker.service';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';
import { IntegrationOrchestratorService } from './integration-orchestrator.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  console.log('=== PHASE 5E.2C SHARED STOP WIRING MOCK ===');
  const fleet = { inspectGate: async () => ({ allowed: false, reason: 'DISABLED', generation: 1n }) } as any;
  let claims = 0;
  const integration = {
    claimNextJob: async () => { claims++; return null; },
    recoverStaleClaims: async () => { throw new Error('recovery must not run when stopped'); },
  } as any;
  const worker = new IntegrationWorkerService(integration, undefined, fleet);
  const idle = await worker.runOnce();
  check('stopped worker does not claim', idle.status === 'IDLE' && claims === 0);
  const orchestrator = new IntegrationOrchestratorService(integration, worker, fleet);
  const tick = await orchestrator.tick();
  check('stopped scheduler does not recover or dispatch', tick.status === 'IDLE' && claims === 0);
  const oldEnabled = process.env.INTEGRATION_EXECUTION_ENABLED;
  const oldTargets = process.env.INTEGRATION_ALLOWED_TARGETS;
  try {
    process.env.INTEGRATION_EXECUTION_ENABLED = 'true';
    process.env.INTEGRATION_ALLOWED_TARGETS = 'SANDBOX';
    const executor = new IntegrationExecutorService(new IntegrationPolicyService(), undefined, fleet);
    let calls = 0;
    executor.registerAdapter('SANDBOX', () => { calls++; return { status: 'SUCCESS' }; });
    const result = await executor.execute({ jobId: 'synthetic-1', sourceSystem: 'WFM', targetSystem: 'SANDBOX', payload: {} });
    check('stopped executor blocks adapter', result.status === 'BLOCKED' && result.reason === 'FLEET_STOPPED' && calls === 0);
  } finally {
    if (oldEnabled === undefined) delete process.env.INTEGRATION_EXECUTION_ENABLED;
    else process.env.INTEGRATION_EXECUTION_ENABLED = oldEnabled;
    if (oldTargets === undefined) delete process.env.INTEGRATION_ALLOWED_TARGETS;
    else process.env.INTEGRATION_ALLOWED_TARGETS = oldTargets;
  }
  let paused = 0;
  const claimed = {
    claimNextJob: async () => ({ id: 'job-1', claimToken: 'token-1', targetSystem: 'SANDBOX', payload: {} }),
    pauseClaimedJob: async () => { paused++; return { id: 'job-1', status: 'PENDING' }; },
  } as any;
  let reads = 0;
  const changingFleet = { inspectGate: async () => ({ allowed: ++reads === 1 }) } as any;
  const afterClaim = new IntegrationWorkerService(claimed, undefined, changingFleet);
  const pausedResult = await afterClaim.runOnce();
  check('stop after claim returns job without executing handler', pausedResult.status === 'IDLE' && paused === 1);
  console.log('Phase 5E.2C mock wiring passed. Database races and dispatch fence NOT proven.');
}
main().catch(error => { console.error(error); process.exit(1); });
