import {
  IntegrationAdapter,
  IntegrationAdapterContext,
  IntegrationAdapterResponse,
} from './integration-executor.service';

export type ProviderAdapterDescriptor = {
  targetSystem: string;
  providerName: string;
  externalExecution: true;
};

export interface ProviderAdapter {
  readonly descriptor: ProviderAdapterDescriptor;
  execute(context: IntegrationAdapterContext): Promise<IntegrationAdapterResponse | void>;
}

export function toIntegrationAdapter(provider: ProviderAdapter): IntegrationAdapter {
  if (!provider || typeof provider.execute !== 'function') {
    throw new Error('Provider adapter execute function is required');
  }

  return async (context: IntegrationAdapterContext) => provider.execute(context);
}
