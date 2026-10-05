import { IntegrationOrchestratorService } from './integration-orchestrator.service';

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  console.log('=== PHASE 5A.5 CONTROLLED INTEGRATION ORCHESTRATION ===');

  const calls: string[] = [];
  let releaseWorker!: () => void;
  const workerGate = new Promise<void>((resolve) => { releaseWorker = resolve; });

  const integration: any = {
    recoverStaleClaims: async () => {
      calls.push('recover');
      return { scanned: 1, recovered: 1, failed: 0, externalActionsExecuted: false };
    },
  };
  const worker: any = {
    runOnce: async () => {
      calls.push('worker');
      await workerGate;
      return { status: 'COMPLETED', job: { id: 'job-1' }, externalActionsExecuted: false };
    },
  };

  const orchestrator = new IntegrationOrchestratorService(integration, worker);
  const first = orchestrator.tick(new Date('2026-10-05T00:00:00.000Z'));
  await new Promise((resolve) => setImmediate(resolve));

  const competing = await orchestrator.tick(new Date('2026-10-05T00:00:00.001Z'));
  ok('overlapping orchestration cycle fails closed as BUSY', competing.status === 'BUSY');
  ok('overlapping cycle performs no recovery or worker action', calls.join(',') === 'recover,worker');

  releaseWorker();
  const completed = await first;
  ok('orchestration recovers stale claims before worker execution', calls.join(',') === 'recover,worker');
  ok('bounded worker result is propagated', completed.status === 'COMPLETED');
  ok('orchestration reports no external action execution', completed.externalActionsExecuted === false);
  ok('recovery result reports no external action execution', completed.recovery?.externalActionsExecuted === false);

  const idleCalls: string[] = [];
  const idle = new IntegrationOrchestratorService(
    {
      recoverStaleClaims: async () => {
        idleCalls.push('recover');
        return { scanned: 0, recovered: 0, failed: 0, externalActionsExecuted: false };
      },
    } as any,
    {
      runOnce: async () => {
        idleCalls.push('worker');
        return { status: 'IDLE', job: null, externalActionsExecuted: false };
      },
    } as any,
  );
  const idleResult = await idle.tick();
  ok('empty orchestration cycle returns IDLE', idleResult.status === 'IDLE');
  ok('idle cycle remains bounded to one worker attempt', idleCalls.join(',') === 'recover,worker');

  const failing = new IntegrationOrchestratorService(
    { recoverStaleClaims: async () => ({ scanned: 0, recovered: 0, failed: 0, externalActionsExecuted: false }) } as any,
    { runOnce: async () => { throw new Error('controlled worker failure'); } } as any,
  );
  let failed = false;
  try {
    await failing.tick();
  } catch (error: any) {
    failed = error?.message === 'controlled worker failure';
  }
  ok('unexpected orchestration failure is surfaced', failed);

  (failing as any).worker = { runOnce: async () => ({ status: 'IDLE', job: null, externalActionsExecuted: false }) };
  const afterFailure = await failing.tick();
  ok('orchestration lock releases after failure', afterFailure.status === 'IDLE');

  console.log('Controlled integration orchestration regression gate passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
