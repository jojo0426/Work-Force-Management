import { Injectable, Optional } from '@nestjs/common';
import { IntegrationHealthMetricsService } from './integration-health-metrics.service';
import { IntegrationPolicyService } from './integration-policy.service';
import { IntegrationFleetControlService } from './integration-fleet-control.service';

export type IntegrationExecutionContext = {
  jobId: string;
  claimToken?: string;
  sourceSystem: string;
  targetSystem: string;
  payload: unknown;
  signal?: AbortSignal;
};

export type IntegrationAdapterResult =
  | void
  | { status: 'SUCCESS' }
  | { status: 'REJECTED'; message?: string }
  | { status: 'RETRYABLE_FAILURE'; message?: string };

export type IntegrationAdapter = (
  context: IntegrationExecutionContext,
) => Promise<IntegrationAdapterResult> | IntegrationAdapterResult;

export type IntegrationFailureClassification =
  | 'TRANSIENT'
  | 'PERMANENT'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE';

export class IntegrationExecutionError extends Error {
  constructor(
    message: string,
    readonly classification: IntegrationFailureClassification,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'IntegrationExecutionError';
  }
}

export type IntegrationExecutionResult = {
  status: 'EXECUTED' | 'BLOCKED';
  targetSystem: string;
  reason: 'EXECUTION_DISABLED' | 'TARGET_NOT_ALLOWED' | 'FLEET_STOPPED' | null;
  externalActionsExecuted: boolean;
};

@Injectable()
export class IntegrationExecutorService {
  private readonly adapters = new Map<string, IntegrationAdapter>();
  private readonly allowedTargets = new Set<string>();
  private executionEnabled = false;
  private executionTimeoutMs: number | null = null;

  constructor(private readonly policyService?: IntegrationPolicyService, @Optional() private readonly healthMetrics?: IntegrationHealthMetricsService, @Optional() private readonly fleet?: IntegrationFleetControlService) {}

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

  setExecutionTimeoutMs(timeoutMs: number | null): void {
    if (timeoutMs === null) {
      this.executionTimeoutMs = null;
      return;
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Integration execution timeout must be a positive finite number');
    }
    this.executionTimeoutMs = Math.floor(timeoutMs);
  }

  async execute(context: IntegrationExecutionContext): Promise<IntegrationExecutionResult> {
    const targetSystem = this.normalizeTarget(context.targetSystem);
    const policy = this.policyService?.getPolicy();
    const executionEnabled = policy ? policy.executionEnabled : this.executionEnabled;
    const targetAllowed = policy
      ? this.policyService!.isTargetAllowed(targetSystem)
      : this.allowedTargets.has(targetSystem);
    const executionTimeoutMs = policy ? policy.executionTimeoutMs : this.executionTimeoutMs;

    if (!executionEnabled) {
      this.healthMetrics?.record('BLOCKED');
      return {
        status: 'BLOCKED',
        targetSystem,
        reason: 'EXECUTION_DISABLED',
        externalActionsExecuted: false,
      };
    }

    if (!targetAllowed) {
      this.healthMetrics?.record('BLOCKED');
      return {
        status: 'BLOCKED',
        targetSystem,
        reason: 'TARGET_NOT_ALLOWED',
        externalActionsExecuted: false,
      };
    }

    // Shared snapshot is an additional fail-closed guard, NOT a race-free dispatch fence.
    if (this.fleet && !(await this.fleet.inspectGate()).allowed) {
      this.healthMetrics?.record('BLOCKED');
      return { status: 'BLOCKED', targetSystem, reason: 'FLEET_STOPPED', externalActionsExecuted: false };
    }

    const adapter = this.adapters.get(targetSystem);
    if (!adapter) {
      this.healthMetrics?.record('PERMANENT');
      throw new IntegrationExecutionError(
        `Allowed integration target ${targetSystem} has no registered adapter`,
        'PERMANENT',
        false,
      );
    }

    let adapterResult: IntegrationAdapterResult;
    const invokeAdapter = async (): Promise<IntegrationAdapterResult> => {
      if (executionTimeoutMs === null) {
        adapterResult = await adapter({ ...context, targetSystem });
      } else {
        const controller = new AbortController();
        const timeoutMs = executionTimeoutMs;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new IntegrationExecutionError(
              `Integration adapter ${targetSystem} timed out after ${timeoutMs}ms`,
              'TIMEOUT',
              true,
            ));
          }, timeoutMs);
        });
        try {
          adapterResult = await Promise.race([
            Promise.resolve(adapter({ ...context, targetSystem, signal: controller.signal })),
            timeout,
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
      }
    };
    try {
      if (this.fleet) {
        // No direct/unclaimed adapter calls in a wired fleet.
        if (!context.claimToken) {
          return { status: 'BLOCKED', targetSystem, reason: 'FLEET_STOPPED', externalActionsExecuted: false };
        }
        const fenced = await this.fleet.withFencedDispatch(context.jobId, context.claimToken, invokeAdapter);
        if (!fenced.admitted) {
          return { status: 'BLOCKED', targetSystem, reason: 'FLEET_STOPPED', externalActionsExecuted: false };
        }
        adapterResult = fenced.result;
      } else {
        adapterResult = await invokeAdapter();
      }
    } catch (error) {
      const classified = error instanceof IntegrationExecutionError
        ? error
        : new IntegrationExecutionError(error instanceof Error ? error.message : String(error), 'TRANSIENT', true);
      this.healthMetrics?.record(classified.classification);
      throw classified;
    }

    try {
      this.validateAdapterResult(targetSystem, adapterResult);
    } catch (error) {
      if (error instanceof IntegrationExecutionError) this.healthMetrics?.record(error.classification);
      throw error;
    }
    this.healthMetrics?.record('EXECUTED');

    return {
      status: 'EXECUTED',
      targetSystem,
      reason: null,
      externalActionsExecuted: true,
    };
  }

  private validateAdapterResult(targetSystem: string, result: IntegrationAdapterResult): void {
    if (result === undefined) return;
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new IntegrationExecutionError(
        `Integration adapter ${targetSystem} returned an invalid response`,
        'INVALID_RESPONSE',
        false,
      );
    }

    const status = (result as any).status;
    const message = typeof (result as any).message === 'string'
      ? String((result as any).message).trim()
      : '';

    if (status === 'SUCCESS') return;
    if (status === 'REJECTED') {
      throw new IntegrationExecutionError(
        message || `Integration adapter ${targetSystem} rejected the request`,
        'PERMANENT',
        false,
      );
    }
    if (status === 'RETRYABLE_FAILURE') {
      throw new IntegrationExecutionError(
        message || `Integration adapter ${targetSystem} reported a retryable failure`,
        'TRANSIENT',
        true,
      );
    }

    throw new IntegrationExecutionError(
      `Integration adapter ${targetSystem} returned an invalid response`,
      'INVALID_RESPONSE',
      false,
    );
  }

  private normalizeTarget(target: string): string {
    const normalized = String(target || '').trim().toUpperCase();
    if (!normalized) throw new Error('Integration target is required');
    return normalized;
  }
}
