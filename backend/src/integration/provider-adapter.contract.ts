import {
  IntegrationAdapter,
  IntegrationAdapterResult,
  IntegrationExecutionContext,
} from './integration-executor.service';

export type ProviderAdapterDescriptor = {
  targetSystem: string;
  providerName: string;
  externalExecution: true;
};

export interface ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  execute(context: IntegrationExecutionContext): Promise<IntegrationAdapterResult> | IntegrationAdapterResult;
}

export function toIntegrationAdapter(provider: ProviderAdapter): IntegrationAdapter {
  if (!provider || typeof provider.execute !== 'function') {
    throw new Error('Provider adapter execute function is required');
  }

  return async (context: IntegrationExecutionContext) => provider.execute(context);
}
