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
    if (this.registeredTargets.has(targetSystem)) {
      throw new Error(`Integration adapter already registered for ${targetSystem}`);
    }

    this.executor.registerAdapter(targetSystem, adapter);
    this.registeredTargets.add(targetSystem);

    const currentPolicy = this.policy.getPolicy();
    return {
      targetSystem,
      registered: true,
      policyAllowed: this.policy.isTargetAllowed(targetSystem),
      executionEnabled: currentPolicy.executionEnabled,
    };
  }

  isRegistered(target: string): boolean {
    return this.registeredTargets.has(this.normalizeTarget(target));
  }

  list(): IntegrationAdapterRegistration[] {
    const currentPolicy = this.policy.getPolicy();
    return [...this.registeredTargets]
      .sort()
      .map((targetSystem) => ({
        targetSystem,
        registered: true as const,
        policyAllowed: this.policy.isTargetAllowed(targetSystem),
        executionEnabled: currentPolicy.executionEnabled,
      }));
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
