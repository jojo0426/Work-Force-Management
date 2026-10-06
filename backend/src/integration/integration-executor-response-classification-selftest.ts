import {
  IntegrationExecutionError,
  IntegrationExecutorService,
} from './integration-executor.service';

function ok(name: string, condition: unknown): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function capture(fn: () => Promise<unknown>): Promise<IntegrationExecutionError> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof IntegrationExecutionError) return error;
    throw error;
  }
  throw new Error('Expected IntegrationExecutionError');
}

function configured(target: string, adapter: any) {
  const executor = new IntegrationExecutorService();
  executor.registerAdapter(target, adapter);
  executor.allowTarget(target);
  executor.setExecutionEnabled(true);
  return executor;
}

async function main() {
  console.log('\n=== PHASE 5B.7 EXECUTOR RESPONSE VALIDATION / FAILURE CLASSIFICATION ===');
  const context = { jobId: 'job-5b7', sourceSystem: 'WFM', targetSystem: 'CRM', payload: { id: 1 } };

  const legacy = configured('CRM', async () => undefined);
  const legacyResult = await legacy.execute(context);
  ok('legacy void adapter remains successful', legacyResult.status === 'EXECUTED' && legacyResult.externalActionsExecuted === true);

  const explicit = configured('CRM', async () => ({ status: 'SUCCESS' as const }));
  const explicitResult = await explicit.execute(context);
  ok('explicit SUCCESS adapter response executes', explicitResult.status === 'EXECUTED' && explicitResult.externalActionsExecuted === true);

  const rejected = configured('CRM', async () => ({ status: 'REJECTED' as const, message: 'provider rejected request' }));
  const rejectedError = await capture(() => rejected.execute(context));
  ok('provider rejection is classified PERMANENT', rejectedError.classification === 'PERMANENT' && rejectedError.retryable === false);
  ok('provider rejection preserves diagnostic message', rejectedError.message.includes('provider rejected request'));

  const retryable = configured('CRM', async () => ({ status: 'RETRYABLE_FAILURE' as const, message: 'provider temporarily unavailable' }));
  const retryableError = await capture(() => retryable.execute(context));
  ok('provider retryable failure is classified TRANSIENT', retryableError.classification === 'TRANSIENT' && retryableError.retryable === true);

  const thrown = configured('CRM', async () => { throw new Error('network reset'); });
  const thrownError = await capture(() => thrown.execute(context));
  ok('untyped adapter exception defaults to TRANSIENT', thrownError.classification === 'TRANSIENT' && thrownError.retryable === true);
  ok('untyped adapter exception preserves source diagnostic', thrownError.message.includes('network reset'));

  const malformed = configured('CRM', async () => ({ status: 'UNKNOWN' } as any));
  const malformedError = await capture(() => malformed.execute(context));
  ok('malformed adapter response is INVALID_RESPONSE', malformedError.classification === 'INVALID_RESPONSE' && malformedError.retryable === false);

  const invalidPrimitive = configured('CRM', async () => 'ok' as any);
  const primitiveError = await capture(() => invalidPrimitive.execute(context));
  ok('primitive adapter response fails closed', primitiveError.classification === 'INVALID_RESPONSE' && primitiveError.retryable === false);

  const timeout = configured('CRM', async ({ signal }: any) => {
    await new Promise<void>((resolve) => signal?.addEventListener('abort', () => resolve(), { once: true }));
  });
  timeout.setExecutionTimeoutMs(20);
  const timeoutError = await capture(() => timeout.execute(context));
  ok('timeout is classified TIMEOUT', timeoutError.classification === 'TIMEOUT' && timeoutError.retryable === true);

  console.log('Phase 5B.7 executor response classification regression gate passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
