import { strict as assert } from 'assert';
import { SandboxExternalDispatchGate } from './integration-external-dispatch-gate';

/** A local gateway cannot prove cross-process fencing. Preserve NO-GO. */
async function main(): Promise<void> {
  const replicaA = new SandboxExternalDispatchGate(4n);
  const replicaB = new SandboxExternalDispatchGate(4n);
  let starts = 0;
  const stopB = await replicaB.stop(5n);
  assert.equal(stopB.drained, true);
  assert.equal(await replicaA.start('phase5e2an-isolation-race', 4n, async () => {
    starts++;
  }), 'ACCEPTED');
  assert.equal(starts, 1, 'independent process state allows post-STOP external start');
  console.log('PASS: independent gateway instances do NOT enforce shared STOP');
  console.log('Phase 5E.2AN G1 remains OPEN until gateway is shared and provider enforced.');
}
main().catch(e => { console.error(e); process.exit(1); });
