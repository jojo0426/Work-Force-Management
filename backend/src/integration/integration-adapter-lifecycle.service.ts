import { Injectable } from '@nestjs/common';
import { IntegrationAdapter } from './integration-executor.service';
import {
  IntegrationAdapterRegistration,
  IntegrationAdapterRegistryService,
} from './integration-adapter-registry.service';

export type IntegrationAdapterDefinition = {
  targetSystem: string;
  adapter: IntegrationAdapter;
};

@Injectable()
export class IntegrationAdapterLifecycleService {
  private initialized = false;

  constructor(private readonly registry: IntegrationAdapterRegistryService) {}

  initialize(definitions: readonly IntegrationAdapterDefinition[]): IntegrationAdapterRegistration[] {
    if (this.initialized) {
      throw new Error('Integration adapter lifecycle already initialized');
    }

    const normalizedTargets = definitions.map((definition) => this.normalizeTarget(definition.targetSystem));
    if (new Set(normalizedTargets).size !== normalizedTargets.length) {
      throw new Error('Duplicate integration adapter target in lifecycle definitions');
    }

    const registrations: IntegrationAdapterRegistration[] = [];
    for (const definition of definitions) {
      registrations.push(this.registry.register(definition.targetSystem, definition.adapter));
    }

    this.initialized = true;
    return registrations;
  }

  isInitialized(): boolean {
    return this.initialized;
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
