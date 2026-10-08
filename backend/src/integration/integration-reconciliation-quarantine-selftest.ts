import { IntegrationService } from './integration.service';

function ok(name: string, value: unknown): void {
  if (!value) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  console.log('=== PHASE 5E.2F UNCERTAIN-OUTCOME RECOVERY MOCK ===');
  const date = new Date('2026-10-01T00:00:00.000Z');
  const candidate = { id: 'synthetic-job', status: 'PROCESSING', claimToken: 'synthetic-token', claimedAt: date, retries: 0, maxRetries: 5 };
  let transition: any;
  const prisma = {
    integrationJob: {
      findMany: async () => [candidate],
      updateMany: async (args: any) => { transition = args; return { count: 1 }; },
    },
    integrationAdmission: { count: async () => 1 },
  } as any;
  const service = new IntegrationService(prisma);
  const result = await service.recoverStaleClaims(new Date('2026-10-08T00:00:00.000Z'), 60000);
  ok('stale claim with admission is quarantined', transition.data.status === 'RECONCILIATION_REQUIRED');
  ok('quarantine clears claim ownership', transition.data.claimToken === null);
  ok('quarantine does not consume retry budget', transition.data.retries === undefined);
  ok('quarantine is counted in non-recovered outcomes', result.failed === 1 && result.recovered === 0);
  let retryTransition: any;
  const withoutAdmission = new IntegrationService({
    integrationJob: {
      findMany: async () => [candidate],
      updateMany: async (args: any) => { retryTransition = args; return { count: 1 }; },
    },
    integrationAdmission: { count: async () => 0 },
  } as any);
  await withoutAdmission.recoverStaleClaims(new Date('2026-10-08T00:00:00.000Z'), 60000);
  ok('never-admitted stale claim retains previous recovery behavior', retryTransition.data.status === 'PENDING');
  console.log('Phase 5E.2F mock quarantine passed. Ambiguous failed/rolled-back admissions remain unsafe.');
}
main().catch(error => { console.error(error); process.exit(1); });
