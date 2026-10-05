import { Injectable } from '@nestjs/common';

export type IntegrationExecutionContext = {
  jobId: string;
  sourceSystem: string;
  targetSystem: string;
  payload: unknown;
};

export type IntegrationAdapter = (context: IntegrationExecutionContext) => Promise<void> | void;

export type IntegrationExecutionResult = {
  status: 'EXECUTED' | 'BLOCKED';
  targetSystem: string;
  reason: 'EXECUTION_DISABLED' | 'TARGET_NOT_ALLOWED' | null;
  externalActionsExecuted: boolean;
};

@Injectable()
export class IntegrationExecutorService {
  private readonly adapters = new Map<string, IntegrationAdapter>();
  private readonly allowedTargets = new Set<string>();
  private executionEnabled = false;

  registerAdapter(target: string, adapter: IntegrationAdapter): void {
    const normalizedTarget = this.normalizeTarget(target);
    if (this.adapters.has(normalizedTarget)) {
      throw new Error(`Integration adapter already registered for ${normalizedTarget}`);
    }
    this.adapters.set(normalizedTarget, adapter);
  }

  allowTarget(target: string): void {
    this.allowedTargets.add(this.normalizeTarget(target));
  }

  setExecutionEnabled(enabled: boolean): void {
    this.executionEnabled = enabled === true;
  }

  async execute(context: IntegrationExecutionContext): Promise<IntegrationExecutionResult> {
    const targetSystem = this.normalizeTarget(context.targetSystem);

    if (!this.executionEnabled) {
      return {
        status: 'BLOCKED',
        targetSystem,
        reason: 'EXECUTION_DISABLED',
        externalActionsExecuted: false,
      };
    }

    if (!this.allowedTargets.has(targetSystem)) {
      return {
        status: 'BLOCKED',
        targetSystem,
        reason: 'TARGET_NOT_ALLOWED',
        externalActionsExecuted: false,
      };
    }

    const adapter = this.adapters.get(targetSystem);
    if (!adapter) {
      throw new Error(`Allowed integration target ${targetSystem} has no registered adapter`);
    }

    await adapter({ ...context, targetSystem });
    return {
      status: 'EXECUTED',
      targetSystem,
      reason: null,
      externalActionsExecuted: true,
    };
  }

  private normalizeTarget(target: string): string {
    const normalized = String(target || '').trim().toUpperCase();
    if (!normalized) throw new Error('Integration target is required');
    return normalized;
  }
}
