import { IntegrationExecutorService } from './integration-executor.service';

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main() {
  const calls: unknown[] = [];
  const executor = new IntegrationExecutorService();
  executor.registerAdapter('CRM', async (context) => { calls.push(context.payload); });
  executor.allowTarget('CRM');

  const context = {
    jobId: 'job-1',
    sourceSystem: 'WFM',
    targetSystem: 'crm',
    payload: { workOrderId: 'wo-1' },
  };

  const disabled = await executor.execute(context);
  ok('external execution is disabled by default', disabled.status === 'BLOCKED' && disabled.reason === 'EXECUTION_DISABLED');
  ok('disabled execution invokes no adapter', calls.length === 0 && disabled.externalActionsExecuted === false);

  executor.setExecutionEnabled(true);
  const executed = await executor.execute(context);
  ok('explicitly enabled allow-listed target executes adapter', executed.status === 'EXECUTED' && calls.length === 1);
  ok('executed result explicitly reports external action boundary', executed.externalActionsExecuted === true);

  const blocked = await executor.execute({ ...context, jobId: 'job-2', targetSystem: 'BILLING' });
  ok('non-allow-listed target fails closed', blocked.status === 'BLOCKED' && blocked.reason === 'TARGET_NOT_ALLOWED');
  ok('blocked target invokes no adapter', calls.length === 1 && blocked.externalActionsExecuted === false);

  let duplicateRejected = false;
  try {
    executor.registerAdapter('crm', async () => undefined);
  } catch {
    duplicateRejected = true;
  }
  ok('duplicate adapter registration is rejected', duplicateRejected);

  let emptyTargetRejected = false;
  try {
    executor.allowTarget('   ');
  } catch {
    emptyTargetRejected = true;
  }
  ok('empty allow-list target is rejected', emptyTargetRejected);

  const missingAdapter = new IntegrationExecutorService();
  missingAdapter.allowTarget('CRM');
  missingAdapter.setExecutionEnabled(true);
  let missingAdapterRejected = false;
  try {
    await missingAdapter.execute(context);
  } catch (error: any) {
    missingAdapterRejected = String(error?.message ?? error).includes('no registered adapter');
  }
  ok('allow-listed target without adapter fails closed', missingAdapterRejected);

  console.log('Phase 5B.1 controlled integration executor regression gate passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
