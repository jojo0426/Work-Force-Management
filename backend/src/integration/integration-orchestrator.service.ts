import { Injectable } from '@nestjs/common';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';

export type IntegrationOrchestratorTickResult = {
  status: 'BUSY' | 'IDLE' | 'COMPLETED' | 'FAILED';
  recovery: {
    scanned: number;
    recovered: number;
    failed: number;
    externalActionsExecuted: false;
  } | null;
  worker: any;
  externalActionsExecuted: false;
};

@Injectable()
export class IntegrationOrchestratorService {
  private running = false;

  constructor(
    private readonly integration: IntegrationService,
    private readonly worker: IntegrationWorkerService,
  ) {}

  /**
   * Execute one bounded orchestration cycle.
   *
   * Phase 5A.5 deliberately does not install a timer, cron job, lifecycle hook,
   * or background loop. A caller must explicitly invoke tick(). This keeps
   * scheduling controlled while we validate recovery + worker composition.
   */
  async tick(
    now = new Date(),
    options: {
      leaseMs?: number;
      retryDelayMs?: number;
      recoveryTake?: number;
    } = {},
  ): Promise<IntegrationOrchestratorTickResult> {
    if (this.running) {
      return {
        status: 'BUSY',
        recovery: null,
        worker: null,
        externalActionsExecuted: false,
      };
    }

    this.running = true;
    try {
      const leaseMs = options.leaseMs ?? 5 * 60_000;
      const retryDelayMs = options.retryDelayMs ?? 30_000;
      const recoveryTake = options.recoveryTake ?? 10;

      const recovery = await this.integration.recoverStaleClaims(
        now,
        leaseMs,
        retryDelayMs,
        recoveryTake,
      );
      const worker = await this.worker.runOnce(now, retryDelayMs);

      return {
        status: worker.status,
        recovery: {
          scanned: recovery.scanned,
          recovered: recovery.recovered,
          failed: recovery.failed,
          externalActionsExecuted: false,
        },
        worker,
        externalActionsExecuted: false,
      };
    } finally {
      this.running = false;
    }
  }
}
