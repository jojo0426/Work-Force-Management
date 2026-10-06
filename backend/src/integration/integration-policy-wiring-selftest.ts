import 'reflect-metadata';
import { AppModule } from '../app.module';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationModule } from './integration.module';
import { IntegrationPolicyService } from './integration-policy.service';

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

async function main(): Promise<void> {
  console.log('\n=== PHASE 5C.1C PRODUCTION POLICY WIRING / BYPASS HARDENING ===');

  const appImports: unknown[] = Reflect.getMetadata('imports', AppModule) ?? [];
  ok('production AppModule imports IntegrationModule', appImports.includes(IntegrationModule));

  const integrationProviders: unknown[] = Reflect.getMetadata('providers', IntegrationModule) ?? [];
  ok('IntegrationModule provides IntegrationPolicyService', integrationProviders.includes(IntegrationPolicyService));
  ok('IntegrationModule provides IntegrationExecutorService directly', integrationProviders.includes(IntegrationExecutorService));
  ok('executor has no alternate factory/provider registration', !integrationProviders.some((provider: any) => provider && typeof provider === 'object' && provider.provide === IntegrationExecutorService));

  const executorDependencies: unknown[] = Reflect.getMetadata('design:paramtypes', IntegrationExecutorService) ?? [];
  ok('production executor declares IntegrationPolicyService dependency', executorDependencies[0] === IntegrationPolicyService);

  let adapterCalls = 0;
  const failClosedPolicy = {
    getPolicy: () => ({
      executionEnabled: false,
      allowedTargets: [] as string[],
      executionTimeoutMs: 30_000,
      retryDelayMs: 30_000,
    }),
    isTargetAllowed: () => false,
  } as unknown as IntegrationPolicyService;

  const executor = new IntegrationExecutorService(failClosedPolicy);
  executor.registerAdapter('CRM', async () => { adapterCalls += 1; });
  executor.setExecutionEnabled(true);
  executor.allowTarget('CRM');

  const result = await executor.execute({
    jobId: 'phase5c1c-wiring',
    sourceSystem: 'WFM',
    targetSystem: 'CRM',
    payload: {},
  });

  ok('injected production policy remains authoritative over legacy setters', result.status === 'BLOCKED' && result.reason === 'EXECUTION_DISABLED');
  ok('policy-governed blocked execution invokes no adapter', adapterCalls === 0 && result.externalActionsExecuted === false);

  console.log('Phase 5C.1C production policy wiring / bypass hardening passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
