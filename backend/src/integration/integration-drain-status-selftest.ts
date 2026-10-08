import { IntegrationFleetControlService } from './integration-fleet-control.service';

function check(name: string, condition: boolean): void {
  if (!condition) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  console.log('=== PHASE 5E.2H DRAIN STATUS SELFTEST ===');
  let enabled = false;
  let unresolved = 2;
  let reconciled = false;
  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(prisma),
    integrationFleetControl: {
      findUnique: async () => ({ enabled, generation: 7n }),
    },
    integrationAdmission: {
      count: async () => unresolved,
      updateMany: async () => { reconciled = true; return { count: 1 }; },
    },
    integrationJob: {
      findUnique: async () => ({ status: 'COMPLETED', claimToken: null }),
    },
  } as any;
  const fleet = new IntegrationFleetControlService(prisma);
  const pending = await fleet.inspectDrain();
  check('stopped fleet with unresolved attempts is NOT drained', pending.stopped && !pending.drained && pending.unresolved === 2);
  unresolved = 0;
  const empty = await fleet.inspectDrain();
  check('stopped fleet with zero unresolved attempts reports drained', empty.drained);
  enabled = true;
  const running = await fleet.inspectDrain();
  check('enabled fleet never reports drained', !running.drained && !running.stopped);
  check('completed claim can settle a committed attempt', (await fleet.settleCompletedClaim('synthetic-job', 'claim')) === 1 && reconciled);
  const missing = new IntegrationFleetControlService({
    $transaction: async () => { throw new Error('database unavailable'); },
  } as any);
  check('database failure fails closed', !(await missing.inspectDrain()).drained);
  console.log('Phase 5E.2H drain-status selftest passed (mock-only).');
}
main().catch(error => { console.error(error); process.exit(1); });
