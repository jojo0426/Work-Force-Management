import { IntegrationWorkerService } from './integration-worker.service';

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  const calls: unknown[] = [];
  const queue: any[] = [];
  const integration: any = {
    claimNextJob: async () => queue.shift() ?? null,
    completeClaimedJob: async (id: string, token: string) => ({ id, claimToken: null, status: 'COMPLETED', completedWith: token }),
    failClaimedJob: async (id: string, token: string, error: any) => ({ id, claimToken: null, status: 'PENDING', failedWith: token, lastError: String(error?.message ?? error) }),
  };

  const worker = new IntegrationWorkerService(integration);
  worker.registerHandler('CRM', async (payload) => { calls.push(payload); });

  const idle = await worker.runOnce();
  ok('empty queue returns idle', idle.status === 'IDLE' && idle.externalActionsExecuted === false);

  queue.push({ id: 'job-1', targetSystem: 'CRM', payload: { workOrderId: 'wo-1' }, claimToken: 'claim-1' });
  const completed = await worker.runOnce();
  ok('registered local handler executes once', calls.length === 1);
  ok('successful handler completes owned claim', completed.status === 'COMPLETED' && completed.job.status === 'COMPLETED');
  ok('worker reports no external action execution', completed.externalActionsExecuted === false);

  queue.push({ id: 'job-2', targetSystem: 'UNKNOWN', payload: {}, claimToken: 'claim-2' });
  const unknown = await worker.runOnce();
  ok('unknown target fails closed through queue lifecycle', unknown.status === 'FAILED' && unknown.job.status === 'PENDING');
  ok('unknown target does not invoke registered handler', calls.length === 1);

  const failingIntegration: any = {
    ...integration,
    claimNextJob: async () => ({ id: 'job-3', targetSystem: 'BILLING', payload: { workOrderId: 'wo-3' }, claimToken: 'claim-3' }),
  };
  const failingWorker = new IntegrationWorkerService(failingIntegration);
  failingWorker.registerHandler('BILLING', async () => { throw new Error('controlled handler failure'); });
  const failed = await failingWorker.runOnce();
  ok('handler failure uses durable failure transition', failed.status === 'FAILED' && failed.job.lastError === 'controlled handler failure');

  let duplicateRejected = false;
  try {
    worker.registerHandler('crm', async () => undefined);
  } catch {
    duplicateRejected = true;
  }
  ok('duplicate handler registration is rejected', duplicateRejected);

  console.log('Controlled integration worker regression gate passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
