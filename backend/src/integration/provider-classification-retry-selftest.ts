import { IntegrationExecutionError, IntegrationExecutorService } from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';
import { IntegrationWorkerService } from './integration-worker.service';

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

type Job = { id: string; sourceSystem: string; targetSystem: string; payload: unknown; status: 'PENDING'|'PROCESSING'|'COMPLETED'|'FAILED'; retries: number; maxRetries: number; nextAttemptAt: Date; claimToken: string|null; claimedAt: Date|null; failedAt: Date|null; lastError: string|null };

function integration(job: Job) {
  let sequence = 0;
  return {
    claimNextJob: async (now: Date) => {
      if (job.status !== 'PENDING' || job.nextAttemptAt > now) return null;
      job.status = 'PROCESSING'; job.claimToken = `claim-${++sequence}`; job.claimedAt = now; return { ...job };
    },
    failClaimedJob: async (_id: string, token: string, error: unknown, delay: number, now: Date, retryable = true) => {
      if (job.status !== 'PROCESSING' || job.claimToken !== token) throw new Error('claim mismatch');
      job.retries += 1;
      const terminal = retryable === false || job.retries >= job.maxRetries;
      job.status = terminal ? 'FAILED' : 'PENDING';
      job.failedAt = terminal ? now : null;
      job.lastError = error instanceof Error ? error.message : String(error);
      if (!terminal) job.nextAttemptAt = new Date(now.getTime() + delay);
      job.claimToken = null; job.claimedAt = null; return { ...job };
    },
    completeClaimedJob: async () => { job.status = 'COMPLETED'; return { ...job }; },
  };
}

async function withPolicy(fn: () => Promise<void>) {
  const beforeEnabled = process.env.INTEGRATION_EXECUTION_ENABLED;
  const beforeTargets = process.env.INTEGRATION_ALLOWED_TARGETS;
  process.env.INTEGRATION_EXECUTION_ENABLED = 'true';
  process.env.INTEGRATION_ALLOWED_TARGETS = 'CRM';
  try { await fn(); } finally {
    if (beforeEnabled === undefined) delete process.env.INTEGRATION_EXECUTION_ENABLED; else process.env.INTEGRATION_EXECUTION_ENABLED = beforeEnabled;
    if (beforeTargets === undefined) delete process.env.INTEGRATION_ALLOWED_TARGETS; else process.env.INTEGRATION_ALLOWED_TARGETS = beforeTargets;
  }
}

async function main() {
  console.log('\n=== PHASE 5C.7 CLASSIFICATION-AWARE DURABLE RETRY POLICY ===');

  await withPolicy(async () => {
    const job: Job = { id:'permanent', sourceSystem:'WFM', targetSystem:'CRM', payload:{}, status:'PENDING', retries:0, maxRetries:5, nextAttemptAt:new Date(0), claimToken:null, claimedAt:null, failedAt:null, lastError:null };
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('CRM', async () => ({ status:'REJECTED', message:'provider rejected permanently' }));
    const worker = new IntegrationWorkerService(integration(job) as any, executor); worker.registerExecutorHandler('CRM');
    const result = await worker.runOnce(new Date('2026-10-06T02:00:00Z'), 30000);
    ok('PERMANENT rejection becomes terminal before retry exhaustion', result.status === 'FAILED' && job.status === 'FAILED' && job.retries === 1);
    ok('PERMANENT terminal transition records failedAt', job.failedAt !== null);
    ok('PERMANENT diagnostic is preserved', job.lastError === 'provider rejected permanently');
    ok('PERMANENT rejection cannot be reclaimed', (await worker.runOnce(new Date('2026-10-06T03:00:00Z'), 30000)).status === 'IDLE');
  });

  await withPolicy(async () => {
    const job: Job = { id:'invalid', sourceSystem:'WFM', targetSystem:'CRM', payload:{}, status:'PENDING', retries:0, maxRetries:5, nextAttemptAt:new Date(0), claimToken:null, claimedAt:null, failedAt:null, lastError:null };
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('CRM', async () => ({ status:'BOGUS' } as any));
    const worker = new IntegrationWorkerService(integration(job) as any, executor); worker.registerExecutorHandler('CRM');
    await worker.runOnce(new Date('2026-10-06T02:00:00Z'), 30000);
    ok('INVALID_RESPONSE is terminal without consuming retry budget', job.status === 'FAILED' && job.retries === 1 && job.maxRetries === 5);
  });

  await withPolicy(async () => {
    const job: Job = { id:'transient', sourceSystem:'WFM', targetSystem:'CRM', payload:{}, status:'PENDING', retries:0, maxRetries:5, nextAttemptAt:new Date(0), claimToken:null, claimedAt:null, failedAt:null, lastError:null };
    const executor = new IntegrationExecutorService(new IntegrationPolicyService());
    executor.registerAdapter('CRM', async () => ({ status:'RETRYABLE_FAILURE', message:'temporary provider failure' }));
    const worker = new IntegrationWorkerService(integration(job) as any, executor); worker.registerExecutorHandler('CRM');
    await worker.runOnce(new Date('2026-10-06T02:00:00Z'), 30000);
    ok('TRANSIENT failure remains PENDING for durable retry', job.status === 'PENDING' && job.retries === 1);
    ok('TRANSIENT failure schedules retry', job.nextAttemptAt.getTime() === new Date('2026-10-06T02:00:30Z').getTime());
  });

  const synthetic: any = { id:'synthetic', sourceSystem:'WFM', targetSystem:'CRM', payload:{}, status:'PENDING', retries:0, maxRetries:5, nextAttemptAt:new Date(0), claimToken:null, claimedAt:null, failedAt:null, lastError:null };
  const custom = integration(synthetic) as any;
  const worker = new IntegrationWorkerService(custom);
  worker.registerHandler('CRM', async () => { throw new Error('untyped handler failure'); });
  await worker.runOnce(new Date('2026-10-06T02:00:00Z'), 30000);
  ok('untyped handler errors remain retryable for compatibility', synthetic.status === 'PENDING' && synthetic.retries === 1);

  const classified: any = { id:'classified', sourceSystem:'WFM', targetSystem:'CRM', payload:{}, status:'PENDING', retries:0, maxRetries:5, nextAttemptAt:new Date(0), claimToken:null, claimedAt:null, failedAt:null, lastError:null };
  const classifiedWorker = new IntegrationWorkerService(integration(classified) as any);
  classifiedWorker.registerHandler('CRM', async () => { throw new IntegrationExecutionError('explicit permanent failure', 'PERMANENT', false); });
  await classifiedWorker.runOnce(new Date('2026-10-06T02:00:00Z'), 30000);
  ok('explicit non-retryable execution error is terminal', classified.status === 'FAILED' && classified.retries === 1);

  console.log('Phase 5C.7 classification-aware durable retry policy passed.');
}
main().catch((error) => { console.error(error); process.exit(1); });
