import { IntegrationFleetControlService } from './integration-fleet-control.service';

function check(name: string, value: boolean): void {
  if (!value) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  console.log('=== PHASE 5E.2 SHARED GATE FOUNDATION (MOCK) ===');
  const make = (findUnique: () => Promise<any>) =>
    new IntegrationFleetControlService({ integrationFleetControl: { findUnique } } as any);
  const missing = await make(async () => null).inspectGate();
  check('missing singleton blocks', !missing.allowed && missing.reason === 'MISSING');
  const disabled = await make(async () => ({ enabled: false, generation: 2n })).inspectGate();
  check('disabled row blocks', !disabled.allowed && disabled.reason === 'DISABLED');
  const unavailable = await make(async () => { throw new Error('database unavailable'); }).inspectGate();
  check('database outage blocks without leaking error', !unavailable.allowed && unavailable.reason === 'UNAVAILABLE');
  const enabled = await make(async () => ({ enabled: true, generation: 3n })).inspectGate();
  check('enabled snapshot observed (NOT an execution admission)', enabled.allowed && enabled.generation === 3n);
  console.log('Phase 5E.2 foundation selftest passed; admission fencing remains pending.');
}
main().catch(error => { console.error(error); process.exit(1); });
