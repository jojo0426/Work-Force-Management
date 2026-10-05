import { Injectable } from '@nestjs/common';
import { IntegrationService } from './integration.service';

export type IntegrationWorkerHandler = (payload: unknown) => Promise<void> | void;

@Injectable()
export class IntegrationWorkerService {
  private readonly handlers = new Map<string, IntegrationWorkerHandler>();

  constructor(private readonly integration: IntegrationService) {}

  registerHandler(target: string, handler: IntegrationWorkerHandler): void {
    const normalizedTarget = String(target || '').trim().toUpperCase();
    if (!normalizedTarget) throw new Error('Integration worker target is required');
    if (this.handlers.has(normalizedTarget)) {
      throw new Error(`Integration worker handler already registered for ${normalizedTarget}`);
    }
    this.handlers.set(normalizedTarget, handler);
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
      await handler(job.payload);
      const completed = await this.integration.completeClaimedJob(job.id, claimToken, now);
      return { status: 'COMPLETED' as const, job: completed, externalActionsExecuted: false };
    } catch (error) {
      const failed = await this.integration.failClaimedJob(job.id, claimToken, error, retryDelayMs, now);
      return { status: 'FAILED' as const, job: failed, externalActionsExecuted: false };
    }
  }
}
