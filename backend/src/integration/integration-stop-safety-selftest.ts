import { IntegrationFleetControlService } from './integration-fleet-control.service';
import { deriveProviderAttemptKey, providerIsSafeForAutomatedReconciliation } from './provider-idempotency-evidence';

function check(name: string, condition: boolean): void {
  if (!condition) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  const key = deriveProviderAttemptKey('job-1', 'claim-1', 'BILLING');
  check('stable attempt key', key === deriveProviderAttemptKey('job-1', 'claim-1', 'billing'));
  check('different claim changes key', key !== deriveProviderAttemptKey('job-1', 'claim-2', 'BILLING'));
  check('unverified provider fails closed', !providerIsSafeForAutomatedReconciliation({
    provider: 'MOCK', supportsIdempotency: true, supportsStatusLookup: true,
    idempotencyRetentionSeconds: 3600, validatedInSandbox: false,
  }));
  check('missing status lookup fails closed', !providerIsSafeForAutomatedReconciliation({
    provider: 'MOCK', supportsIdempotency: true, supportsStatusLookup: false,
    idempotencyRetentionSeconds: 3600, validatedInSandbox: true,
  }));
  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(prisma),
    integrationFleetControl: { findUnique: async () => ({ enabled: false, generation: 1n }) },
    integrationAdmission: { count: async () => 0 },
  } as any;
  const fleet = new IntegrationFleetControlService(prisma);
  const stopped = await fleet.inspectStopSafety();
  check('ledger empty is not verified network drain',
    stopped.admissionsClosed && stopped.unresolvedAttempts === 0 &&
    stopped.externalQuiescenceVerified === false);
  console.log('Phase 5E.2L safety contract selftest passed (mock only).');
}
main().catch(error => { console.error(error); process.exit(1); });
