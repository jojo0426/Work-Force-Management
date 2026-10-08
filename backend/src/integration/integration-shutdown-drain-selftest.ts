import { IntegrationShutdownDrainService } from './integration-shutdown-drain.service';

function check(name: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
async function main(): Promise<void> {
  const fake = (acknowledged: boolean, unresolvedAttempts: number | null) =>
    new IntegrationShutdownDrainService({
      stopAndInspect: async () => ({
        acknowledged, unresolvedAttempts, generation: 1n, externallyDrained: false as const,
      }),
    } as any);
  const failed = await fake(false, null).stopAndAssess('ci', 'TEST_STOP');
  check('failed stop escalates', failed.escalated && failed.reason === 'STOP_FAILED');
  const unavailable = await fake(true, null).stopAndAssess('ci', 'TEST_STOP');
  check('unavailable ledger escalates', unavailable.escalated && unavailable.reason === 'LEDGER_UNAVAILABLE');
  const unresolved = await fake(true, 3).stopAndAssess('ci', 'TEST_STOP');
  check('unresolved attempts escalate', unresolved.escalated && unresolved.unresolvedAttempts === 3);
  const empty = await fake(true, 0).stopAndAssess('ci', 'TEST_STOP');
  check('empty ledger never asserts network drain',
    empty.ledgerEmpty && !empty.externallyDrained && !empty.escalated);
  console.log('Phase 5E.2N controlled stop assessment regression passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
