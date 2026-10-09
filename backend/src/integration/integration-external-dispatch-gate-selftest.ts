import { strict as assert } from 'assert';
import { SandboxExternalDispatchGate } from './integration-external-dispatch-gate';

async function main(): Promise<void> {
  const gate = new SandboxExternalDispatchGate(9n);
  let sends = 0;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const pending = new Promise<void>(resolve => { release = resolve; });
  const first = gate.start('phase5e2an-request-one', 9n, async () => {
    sends++;
    entered();
    await pending;
  });
  await started;
  assert.equal(gate.inspect().active, 1);
  let stopAcknowledged = false;
  const stopping = gate.stop(10n).then(result => {
    stopAcknowledged = true;
    return result;
  });
  assert.equal(stopAcknowledged, false, 'STOP must not acknowledge while send active');
  assert.equal(await gate.start('phase5e2an-request-two', 9n, async () => { sends++; }),
    'STOPPED', 'delayed replica rejected after STOP begins');
  assert.equal(await gate.start('phase5e2an-request-three', 10n, async () => { sends++; }),
    'STOPPED', 'new generation blocked until explicitly rearmed');
  release();
  assert.equal(await first, 'ACCEPTED');
  const stopped = await stopping;
  assert.equal(stopped.drained, true);
  assert.equal(stopAcknowledged, true);
  assert.equal(sends, 1);
  assert.equal(gate.inspect().active, 0);
  const secondGate = new SandboxExternalDispatchGate(3n);
  assert.equal(await secondGate.start('phase5e2an-duplicate-id', 3n, async () => { sends++; }),
    'ACCEPTED');
  assert.equal(await secondGate.start('phase5e2an-duplicate-id', 3n, async () => { sends++; }),
    'DUPLICATE');
  assert.equal(await secondGate.start('phase5e2an-stale-epoch', 2n, async () => { sends++; }),
    'STALE_GENERATION');
  assert.equal(sends, 2);
  console.log('Phase 5E.2AN sandbox gateway linearization contract passed.');
}
main().catch(e => { console.error(e); process.exit(1); });
