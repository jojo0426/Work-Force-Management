import { Injectable } from '@nestjs/common';

export type IntegrationPolicy = {
  executionEnabled: boolean;
  allowedTargets: readonly string[];
  executionTimeoutMs: number;
  retryDelayMs: number;
};

@Injectable()
export class IntegrationPolicyService {
  private readonly policy: IntegrationPolicy;
  // Runtime emergency stop is one-way until process restart; no remote re-enable API.
  private emergencyStopped = false;

  constructor() {
    this.policy = this.readPolicy(process.env);
  }

  getPolicy(): IntegrationPolicy {
    return {
      ...this.policy,
      executionEnabled: this.policy.executionEnabled && !this.emergencyStopped,
      allowedTargets: [...this.policy.allowedTargets],
    };
  }

  emergencyStop(): void {
    this.emergencyStopped = true;
  }

  isEmergencyStopped(): boolean {
    return this.emergencyStopped;
  }

  isTargetAllowed(target: string): boolean {
    const normalized = this.normalizeTarget(target);
    return this.policy.allowedTargets.includes(normalized);
  }

  private readPolicy(env: NodeJS.ProcessEnv): IntegrationPolicy {
    return {
      executionEnabled: this.readBoolean(env.INTEGRATION_EXECUTION_ENABLED, false),
      allowedTargets: this.readTargets(env.INTEGRATION_ALLOWED_TARGETS),
      executionTimeoutMs: this.readPositiveInteger(
        env.INTEGRATION_EXECUTION_TIMEOUT_MS,
        30_000,
        'INTEGRATION_EXECUTION_TIMEOUT_MS',
      ),
      retryDelayMs: this.readPositiveInteger(
        env.INTEGRATION_RETRY_DELAY_MS,
        30_000,
        'INTEGRATION_RETRY_DELAY_MS',
      ),
    };
  }

  private readBoolean(value: string | undefined, fallback: boolean): boolean {
    if (value === undefined || value.trim() === '') return fallback;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    throw new Error('INTEGRATION_EXECUTION_ENABLED must be true or false');
  }

  private readTargets(value: string | undefined): readonly string[] {
    if (!value || !value.trim()) return [];
    return [...new Set(value.split(',').map((target) => this.normalizeTarget(target)))];
  }

  private readPositiveInteger(
    value: string | undefined,
    fallback: number,
    name: string,
  ): number {
    if (value === undefined || value.trim() === '') return fallback;
    if (!/^\d+$/.test(value.trim())) {
      throw new Error(`${name} must be a positive integer`);
    }
    const parsed = Number(value.trim());
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a positive safe integer`);
    }
    const maximum = name === 'INTEGRATION_EXECUTION_TIMEOUT_MS' ? 300_000 : 86_400_000;
    if (parsed > maximum) {
      throw new Error(`${name} exceeds the allowed maximum of ${maximum}ms`);
    }
    return parsed;
  }

  private normalizeTarget(target: string): string {
    const normalized = String(target || '').trim().toUpperCase();
    if (!normalized) throw new Error('Integration target is required');
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(normalized)) {
      throw new Error('Invalid integration target');
    }
    return normalized;
  }
}
