import { Injectable } from '@nestjs/common';
import {
  IntegrationAdapter,
  IntegrationExecutorService,
} from './integration-executor.service';
import { IntegrationPolicyService } from './integration-policy.service';

export type IntegrationAdapterRegistration = {
  targetSystem: string;
  registered: true;
  policyAllowed: boolean;
  executionEnabled: boolean;
};

@Injectable()
export class IntegrationAdapterRegistryService {
  private readonly registeredTargets = new Set<string>();

  constructor(
    private readonly executor: IntegrationExecutorService,
    private readonly policy: IntegrationPolicyService,
  ) {}

  register(target: string, adapter: IntegrationAdapter): IntegrationAdapterRegistration {
    const targetSystem = this.normalizeTarget(target);
    if (typeof adapter !== 'function') {
      throw new Error(`Integration adapter for ${targetSystem} must be a function`);
    }
    if (this.registeredTargets.has(targetSystem)) {
      throw new Error(`Integration adapter already registered for ${targetSystem}`);
    }

    this.executor.registerAdapter(targetSystem, adapter);
    this.registeredTargets.add(targetSystem);

    return this.describe(targetSystem);
  }

  isRegistered(target: string): boolean {
    return this.registeredTargets.has(this.normalizeTarget(target));
  }

  get(target: string): IntegrationAdapterRegistration | null {
    const targetSystem = this.normalizeTarget(target);
    return this.registeredTargets.has(targetSystem) ? this.describe(targetSystem) : null;
  }

  list(): IntegrationAdapterRegistration[] {
    return [...this.registeredTargets]
      .sort()
      .map((targetSystem) => this.describe(targetSystem));
  }

  private describe(targetSystem: string): IntegrationAdapterRegistration {
    const currentPolicy = this.policy.getPolicy();
    return {
      targetSystem,
      registered: true,
      policyAllowed: this.policy.isTargetAllowed(targetSystem),
      executionEnabled: currentPolicy.executionEnabled,
    };
  }

  private normalizeTarget(target: string): string {
    const normalized = String(target || '').trim().toUpperCase();
    if (!normalized) throw new Error('Integration target is required');
    if (!/^[A-Z0-9_-]+$/.test(normalized)) {
      throw new Error(`Invalid integration target: ${target}`);
    }
    return normalized;
  }
}
