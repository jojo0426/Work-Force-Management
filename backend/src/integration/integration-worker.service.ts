import { Injectable, Optional } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationExecutorService } from './integration-executor.service';

export type IntegrationWorkerHandlerResult = { externalActionsExecuted?: boolean } | void;
export type IntegrationWorkerHandler = (payload: unknown, job?: any) => Promise<IntegrationWorkerHandlerResult> | IntegrationWorkerHandlerResult;

@Injectable()
export class IntegrationWorkerService {
  private readonly handlers = new Map<string, IntegrationWorkerHandler>();

  constructor(
    private readonly integration: IntegrationService,
    @Optional() private readonly executor?: IntegrationExecutorService,
  ) {}

  registerHandler(target: string, handler: IntegrationWorkerHandler): void {
    const normalizedTarget = String(target || '').trim().toUpperCase();
    if (!normalizedTarget) throw new Error('Integration worker target is required');
    if (this.handlers.has(normalizedTarget)) {
      throw new Error(`Integration worker handler already registered for ${normalizedTarget}`);
    }
    this.handlers.set(normalizedTarget, handler);
  }

  registerExecutorHandler(target: string): void {
    const normalizedTarget = String(target || '').trim().toUpperCase();
    this.registerHandler(normalizedTarget, async (_payload, job) => {
      if (!this.executor) throw new Error('Integration executor is not available');
      const result = await this.executor.execute({
        jobId: job.id,
        sourceSystem: String(job.sourceSystem || ''),
        targetSystem: normalizedTarget,
        payload: job.payload,
      });
      if (result.status !== 'EXECUTED') {
        throw new Error(`Integration executor blocked ${normalizedTarget}: ${result.reason}`);
      }
      return { externalActionsExecuted: result.externalActionsExecuted };
    });
  }

  async runOnce(now = new Date(), retryDelayMs = 30_000) {
    const job = await this.integration.claimNextJob(now);
    if (!job) return { status: 'IDLE' as const, job: null, externalActionsExecuted: false };

    const claimToken = job.claimToken;
    if (!claimToken) throw new Error('Claimed integration job is missing ownership token');

    const target = String(job.targetSystem || '').trim().toUpperCase();
    const handler = this.handlers.get(target);

    if (!handler) {
      const failed = await this.integration.failClaimedJob(
        job.id,
        claimToken,
        new Error(`No controlled integration handler registered for target ${target || '<none>'}`),
        retryDelayMs,
        now,
      );
      return { status: 'FAILED' as const, job: failed, externalActionsExecuted: false };
    }

    try {
      const handlerResult = await handler(job.payload, job);
      const completed = await this.integration.completeClaimedJob(job.id, claimToken, now);
      return {
        status: 'COMPLETED' as const,
        job: completed,
        externalActionsExecuted: handlerResult?.externalActionsExecuted === true,
      };
    } catch (error) {
      const failed = await this.integration.failClaimedJob(job.id, claimToken, error, retryDelayMs, now);
      return { status: 'FAILED' as const, job: failed, externalActionsExecuted: false };
    }
  }
}
