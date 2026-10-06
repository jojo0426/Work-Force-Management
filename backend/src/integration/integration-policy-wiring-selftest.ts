import 'reflect-metadata';
import { AppModule } from '../app.module';
import { IntegrationExecutorService } from './integration-executor.service';
import { IntegrationModule } from './integration.module';
import { IntegrationPolicyService } from './integration-policy.service';

function ok(name: string, condition: boolean): void {
  if (!condition) throw new Error(`FAIL: ${name}`);
  console.log(`PASS: ${name}`);
}

function main(): void {
  console.log('\n=== PHASE 5C.1C PRODUCTION POLICY WIRING / BYPASS HARDENING ===');

  const appImports: unknown[] = Reflect.getMetadata('imports', AppModule) ?? [];
  ok('production AppModule imports IntegrationModule', appImports.includes(IntegrationModule));

  const integrationProviders: unknown[] = Reflect.getMetadata('providers', IntegrationModule) ?? [];
  ok('IntegrationModule provides IntegrationPolicyService', integrationProviders.includes(IntegrationPolicyService));
  ok('IntegrationModule provides IntegrationExecutorService', integrationProviders.includes(IntegrationExecutorService));

  const executorDependencies: unknown[] = Reflect.getMetadata('design:paramtypes', IntegrationExecutorService) ?? [];
  ok('production executor declares policy dependency', executorDependencies[0] === IntegrationPolicyService);

  const source = IntegrationExecutorService.toString();
  ok('executor policy takes precedence over mutable execution flag', source.includes('policy ? policy.executionEnabled : this.executionEnabled'));
  ok('executor policy takes precedence over mutable target allow-list', source.includes("policy\n      ? this.policyService!.isTargetAllowed(targetSystem)\n      : this.allowedTargets.has(targetSystem)"));
  ok('executor policy takes precedence over mutable timeout', source.includes('policy ? policy.executionTimeoutMs : this.executionTimeoutMs'));

  const moduleSource = IntegrationModule.toString();
  ok('module itself contains no runtime executor mutation', !moduleSource.includes('setExecutionEnabled') && !moduleSource.includes('allowTarget'));

  console.log('Phase 5C.1C production policy wiring / bypass hardening passed.');
}

main();
