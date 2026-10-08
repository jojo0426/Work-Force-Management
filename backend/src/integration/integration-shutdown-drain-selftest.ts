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
  let tick = 0;
  let outstanding = 2;
  const polling = new IntegrationShutdownDrainService({
    stopAndInspect: async () => ({
      acknowledged: true, unresolvedAttempts: outstanding,
      generation: 2n, externallyDrained: false,
    }),
    inspectStopSafety: async () => ({
      admissionsClosed: true, unresolvedAttempts: outstanding,
      externalQuiescenceVerified: false, reason: 'STOPPED_WITH_UNCERTAINTY',
    }),
  } as any);
  const timed = await polling.stopAndWaitForLedger('ci', 'TEST_STOP', {
    timeoutMs: 20, pollIntervalMs: 10,
    now: () => tick, sleep: async ms => { tick += ms; },
  });
  check('bounded polling times out and escalates without network drain',
    timed.timedOut && timed.escalated && !timed.externallyDrained && timed.polls === 3);
  tick = 0;
  outstanding = 1;
  const settled = await polling.stopAndWaitForLedger('ci', 'TEST_STOP', {
    timeoutMs: 30, pollIntervalMs: 10,
    now: () => tick, sleep: async ms => { tick += ms; outstanding = 0; },
  });
  check('ledger settles before deadline without asserting network quiescence',
    !settled.timedOut && settled.ledgerEmpty && !settled.externallyDrained);
  console.log('Phase 5E.2N controlled stop assessment regression passed.');
}
main().catch(error => { console.error(error); process.exit(1); });
