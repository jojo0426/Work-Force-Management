import { IntegrationAdapterDefinition } from './integration-adapter-lifecycle.service';
import { ProviderAdapter, toIntegrationAdapter } from './provider-adapter.contract';

export function providerAdapterDefinition(provider: ProviderAdapter): IntegrationAdapterDefinition {
  const targetSystem = normalizeTarget(provider?.descriptor?.targetSystem);
  const providerName = String(provider?.descriptor?.providerName || '').trim();

  if (!providerName) throw new Error('Provider adapter name is required');
  if (provider.descriptor.externalExecution !== true) {
    throw new Error(`Provider adapter ${providerName} must declare external execution boundary`);
  }

  return {
    targetSystem,
    adapter: toIntegrationAdapter(provider),
  };
}

function normalizeTarget(target: string): string {
  const normalized = String(target || '').trim().toUpperCase();
  if (!normalized) throw new Error('Provider adapter target is required');
  if (!/^[A-Z0-9_-]+$/.test(normalized)) {
    throw new Error(`Invalid provider adapter target: ${target}`);
  }
  return normalized;
}
