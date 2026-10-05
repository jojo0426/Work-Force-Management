import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationWorkerService } from './integration-worker.service';

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  const queue: any[] = [];
  const completed: any[] = [];
  const failed: any[] = [];
  const adapterCalls: any[] = [];
  const integration: any = {
    claimNextJob: async () => queue.shift() ?? null,
    completeClaimedJob: async (id: string, token: string) => {
      const result = { id, claimToken: null, status: 'COMPLETED', completedWith: token };
      completed.push(result);
      return result;
    },
    failClaimedJob: async (id: string, token: string, error: any) => {
      const result = { id, claimToken: null, status: 'PENDING', failedWith: token, lastError: String(error?.message ?? error) };
      failed.push(result);
      return result;
    },
  };

  const executor = new IntegrationExecutorService();
  const worker = new IntegrationWorkerService(integration, executor);
  worker.registerExecutorHandler('CRM');
  executor.registerAdapter('CRM', async (context) => { adapterCalls.push(context); });
  executor.allowTarget('CRM');

  queue.push({ id: 'job-disabled', sourceSystem: 'WFM', targetSystem: 'CRM', payload: { workOrderId: 'wo-disabled' }, claimToken: 'claim-disabled' });
  const disabled = await worker.runOnce();
  ok('disabled executor blocks adapter invocation', adapterCalls.length === 0);
  ok('disabled executor uses durable failure transition', disabled.status === 'FAILED' && disabled.job.status === 'PENDING');
  ok('disabled executor reports no external action execution', disabled.externalActionsExecuted === false);
  ok('disabled executor persists explicit boundary reason', disabled.job.lastError.includes('EXECUTION_DISABLED'));

  executor.setExecutionEnabled(true);
  queue.push({ id: 'job-enabled', sourceSystem: 'WFM', targetSystem: 'CRM', payload: { workOrderId: 'wo-enabled' }, claimToken: 'claim-enabled' });
  const executed = await worker.runOnce();
  ok('enabled allow-listed executor invokes adapter once', adapterCalls.length === 1);
  ok('executor receives durable job identity and source', adapterCalls[0].jobId === 'job-enabled' && adapterCalls[0].sourceSystem === 'WFM');
  ok('successful executor result completes owned claim', executed.status === 'COMPLETED' && executed.job.status === 'COMPLETED');
  ok('worker propagates external action execution boundary', executed.externalActionsExecuted === true);

  const blockedExecutor = new IntegrationExecutorService();
  const blockedWorker = new IntegrationWorkerService(integration, blockedExecutor);
  blockedWorker.registerExecutorHandler('BILLING');
  blockedExecutor.registerAdapter('BILLING', async () => { throw new Error('blocked adapter must not run'); });
  blockedExecutor.setExecutionEnabled(true);
  queue.push({ id: 'job-blocked', sourceSystem: 'WFM', targetSystem: 'BILLING', payload: {}, claimToken: 'claim-blocked' });
  const blocked = await blockedWorker.runOnce();
  ok('non-allow-listed executor target fails through durable lifecycle', blocked.status === 'FAILED' && blocked.job.status === 'PENDING');
  ok('blocked executor target reports no external action execution', blocked.externalActionsExecuted === false);
  ok('blocked executor persists explicit target reason', blocked.job.lastError.includes('TARGET_NOT_ALLOWED'));

  const failingExecutor = new IntegrationExecutorService();
  const failingWorker = new IntegrationWorkerService(integration, failingExecutor);
  failingWorker.registerExecutorHandler('ERP');
  failingExecutor.registerAdapter('ERP', async () => { throw new Error('controlled adapter failure'); });
  failingExecutor.allowTarget('ERP');
  failingExecutor.setExecutionEnabled(true);
  queue.push({ id: 'job-failure', sourceSystem: 'WFM', targetSystem: 'ERP', payload: {}, claimToken: 'claim-failure' });
  const adapterFailure = await failingWorker.runOnce();
  ok('adapter failure uses durable retry transition', adapterFailure.status === 'FAILED' && adapterFailure.job.lastError === 'controlled adapter failure');
  ok('failed adapter call is not reported as completed external action', adapterFailure.externalActionsExecuted === false);

  ok('only successful executor path completes a claim', completed.length === 1);
  ok('blocked and failed executor paths remain retryable', failed.length === 3);
  console.log('Phase 5B.2 worker executor boundary regression gate passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
