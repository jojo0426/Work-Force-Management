import {
  IntegrationExecutionError,
  IntegrationExecutorService,
} from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';

const POLICY_ENV_KEYS = [
  'INTEGRATION_EXECUTION_ENABLED',
  'INTEGRATION_ALLOWED_TARGETS',
  'INTEGRATION_EXECUTION_TIMEOUT_MS',
  'INTEGRATION_RETRY_DELAY_MS',
] as const;

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function withEnv(values: Record<string, string>, fn: () => Promise<void>): Promise<void> {
  const before = new Map(POLICY_ENV_KEYS.map((key) => [key, process.env[key]]));
  try {
    for (const key of POLICY_ENV_KEYS) delete process.env[key];
    for (const [key, value] of Object.entries(values)) process.env[key] = value;
    await fn();
  } finally {
    for (const key of POLICY_ENV_KEYS) {
      const value = before.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.4B PROVIDER CANCELLATION / LATE-COMPLETION SAFETY ===');

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
    INTEGRATION_EXECUTION_TIMEOUT_MS: '25',
  }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const observed = {
      calls: 0,
      signalProvided: false,
      abortObserved: false,
      sideEffectCommitted: false,
    };

    executor.registerAdapter('CRM', async (context) => {
      observed.calls += 1;
      observed.signalProvided = context.signal instanceof AbortSignal;

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          observed.sideEffectCommitted = true;
          resolve();
        }, 100);

        context.signal?.addEventListener('abort', () => {
          observed.abortObserved = true;
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });

      if (context.signal?.aborted) {
        return { status: 'RETRYABLE_FAILURE', message: 'provider execution aborted' };
      }

      return { status: 'SUCCESS' };
    });

    let error: IntegrationExecutionError | undefined;
    try {
      await executor.execute({
        jobId: 'phase5c4b-timeout-abort',
        sourceSystem: 'WFM',
        targetSystem: 'CRM',
        payload: { case: 'timeout-abort' },
      });
    } catch (caught) {
      if (caught instanceof IntegrationExecutionError) error = caught;
      else throw caught;
    }

    ok('timed out provider rejects through execution error boundary', error instanceof IntegrationExecutionError);
    ok('timed out provider remains classified TIMEOUT', error?.classification === 'TIMEOUT');
    ok('timed out provider remains retryable', error?.retryable === true);
    ok('executor provides cancellation signal to timed provider', observed.signalProvided);
    ok('provider observes executor timeout abort signal', observed.abortObserved);
    ok('timeout performs exactly one provider invocation', observed.calls === 1);

    await new Promise((resolve) => setTimeout(resolve, 110));
    ok('cooperative provider prevents late side effect after timeout', !observed.sideEffectCommitted);
  });

  await withEnv({
    INTEGRATION_EXECUTION_ENABLED: 'true',
    INTEGRATION_ALLOWED_TARGETS: 'CRM',
    INTEGRATION_EXECUTION_TIMEOUT_MS: '100',
  }, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    const observed = {
      signalProvided: false,
      abortObserved: false,
      calls: 0,
    };

    executor.registerAdapter('CRM', async (context) => {
      observed.calls += 1;
      observed.signalProvided = context.signal instanceof AbortSignal;
      observed.abortObserved = context.signal?.aborted === true;
      await new Promise((resolve) => setTimeout(resolve, 5));
      observed.abortObserved = observed.abortObserved || context.signal?.aborted === true;
      return { status: 'SUCCESS' };
    });

    const result = await executor.execute({
      jobId: 'phase5c4b-success',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: { case: 'success' },
    });

    ok('successful timed execution receives cancellation signal', observed.signalProvided);
    ok('successful provider is not spuriously aborted', !observed.abortObserved);
    ok('successful provider executes exactly once', observed.calls === 1);
    ok('successful provider remains EXECUTED', result.status === 'EXECUTED' && result.externalActionsExecuted === true);
  });

  await withEnv({}, async () => {
    const policy = new IntegrationPolicyService();
    const executor = new IntegrationExecutorService(policy);
    let calls = 0;

    executor.registerAdapter('CRM', async () => {
      calls += 1;
      return { status: 'SUCCESS' };
    });

    const result = await executor.execute({
      jobId: 'phase5c4b-disabled',
      sourceSystem: 'WFM',
      targetSystem: 'CRM',
      payload: {},
    });

    ok('cancellation hardening preserves fail-closed default', result.status === 'BLOCKED');
    ok('blocked provider remains uninvoked', calls === 0);
  });

  console.log('Phase 5C.4B provider cancellation / late-completion safety passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
