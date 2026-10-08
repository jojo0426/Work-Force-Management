import { IntegrationAdapter, IntegrationExecutionContext } from './integration-executor.service';

export type ProviderAcceptanceProfile = Readonly<{
  providerId: string;
  targetSystem: string;
  environment: 'MOCK';
  endpoint: 'in-memory';
  authentication: 'synthetic-token';
  idempotency: 'jobId';
  requestAction: 'PING';
  responseStatus: 'SUCCESS';
  transientCodes: readonly string[];
  permanentCodes: readonly string[];
}>;

export const MOCK_PROVIDER_ACCEPTANCE: ProviderAcceptanceProfile = Object.freeze({
  providerId: 'FIBERBLAZE_MOCK',
  targetSystem: 'SANDBOX',
  environment: 'MOCK',
  endpoint: 'in-memory',
  authentication: 'synthetic-token',
  idempotency: 'jobId',
  requestAction: 'PING',
  responseStatus: 'SUCCESS',
  transientCodes: ['RATE_LIMIT', 'UNAVAILABLE'],
  permanentCodes: ['UNAUTHORIZED', 'INVALID_REQUEST'],
});

export type MockProviderOutcome = 'SUCCESS' | 'RATE_LIMIT' | 'UNAVAILABLE' | 'UNAUTHORIZED' | 'INVALID_REQUEST';

export function createMockAcceptanceAdapter(
  outcome: MockProviderOutcome,
  observedJobIds: string[],
): IntegrationAdapter {
  return (context: IntegrationExecutionContext) => {
    if (!context.jobId || !context.jobId.trim()) {
      return { status: 'REJECTED', message: 'INVALID_REQUEST' };
    }
    observedJobIds.push(context.jobId);
    if (outcome === 'RATE_LIMIT' || outcome === 'UNAVAILABLE') {
      return { status: 'RETRYABLE_FAILURE', message: outcome };
    }
    if (outcome === 'UNAUTHORIZED' || outcome === 'INVALID_REQUEST') {
      return { status: 'REJECTED', message: outcome };
    }
    return { status: 'SUCCESS' };
  };
}
