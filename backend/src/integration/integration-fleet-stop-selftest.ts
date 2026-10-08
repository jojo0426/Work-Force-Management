import { IntegrationFleetControlService } from './integration-fleet-control.service';

function check(name: string, valid: boolean): void {
  if (!valid) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  console.log('=== PHASE 5E.2B STOP / RESERVATION CONTRACT (MOCK ONLY) ===');
  const events: string[] = [];
  let enabled = true;
  let generation = 4n;
  const tx = {
    $queryRaw: async () => {
      events.push('row-lock');
      return [{ id: 'GLOBAL', enabled, generation }];
    },
    integrationFleetControl: {
      update: async (args: any) => {
        events.push('stop-update');
        check('stop writes disabled state', args.data.enabled === false);
        enabled = false;
        generation += 1n;
        return { generation };
      },
    },
    integrationJob: {
      findFirst: async ({ where }: any) => where.claimToken === 'valid-claim' ? { id: where.id } : null,
    },
    integrationAdmission: {
      create: async ({ data }: any) => {
        events.push('admission-create');
        check('admission carries locked generation', data.generation === generation);
        return data;
      },
    },
  };
  const control = new IntegrationFleetControlService({ $transaction: async (fn: any) => fn(tx) } as any);
  check('reject empty job identity', !(await control.reserveAdmission('', 'valid-claim')).admitted);
  check('reject stale claim', !(await control.reserveAdmission('job-1', 'stale-claim')).admitted);
  const reserved = await control.reserveAdmission('job-1', 'valid-claim');
  check('valid mock claim admitted', reserved.admitted && !!reserved.admissionId);
  const stop = await control.stopFleet('operator-1', 'OPERATOR_STOP');
  check('stop increments generation', stop.stopped && stop.generation === 5n);
  check('stop blocks new admissions', !(await control.reserveAdmission('job-2', 'valid-claim')).admitted);
  check('both operations acquire row lock', events.filter(e => e === 'row-lock').length === 4);
  try {
    await control.stopFleet('invalid operator!', 'STOP');
    throw new Error('Expected operator validation');
  } catch (error) {
    check('unsafe operator identifiers rejected', (error as Error).message.includes('safe operator'));
  }
  const missing = new IntegrationFleetControlService({
    $transaction: async (fn: any) => fn({ $queryRaw: async () => [] }),
  } as any);
  check('missing singleton fails closed', !(await missing.reserveAdmission('job-1', 'valid-claim')).admitted);
  check('missing singleton stop not acknowledged', !(await missing.stopFleet('operator-1', 'STOP')).stopped);
  console.log('Phase 5E.2B mocked stop/reservation contract passed. Database race E2E and execution wiring remain pending.');
}
main().catch(error => { console.error(error); process.exit(1); });
