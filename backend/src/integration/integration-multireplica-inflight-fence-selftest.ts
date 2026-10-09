import { FencingState, acknowledgeLocalStop, recordSendIntent,
  observeExternalStart, reportedStopContract } from './integration-dispatch-fence-contract';

/**
 * Deterministic two-replica adversarial scheduler. No external provider calls.
 * Demonstrates the exact safety failure that requires provider-side fencing.
 */
function assert(name: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + name);
  console.log('PASS: ' + name);
}
const start: FencingState = {
  enabled: true, generation: 21, phase: 'AUTHORIZED',
  stopAcknowledged: false, externalStartObserved: false,
  providerFenceVerified: false,
};
const replicaA = recordSendIntent(start);
const replicaB = acknowledgeLocalStop(replicaA);
assert('replica B STOP increments generation', replicaB.generation === 22);
assert('replica B cannot claim provider quiescence',
  reportedStopContract(replicaB) === 'ADMISSIONS_CLOSED');
const delayedA = observeExternalStart(replicaB);
assert('replica A may externally start after STOP despite durable send intent',
  delayedA.externalStartObserved && delayedA.stopAcknowledged);
assert('no provider fence evidence means production remains blocked',
  reportedStopContract(delayedA) === 'ADMISSIONS_CLOSED');
const killedA: FencingState = { ...delayedA, phase: 'OUTCOME_UNKNOWN' };
assert('SIGKILL of in-flight replica cannot resolve external outcome',
  reportedStopContract(killedA) === 'ADMISSIONS_CLOSED');
assert('unknown external outcome remains unresolved',
  killedA.phase === 'OUTCOME_UNKNOWN');
console.log('Phase 5E.2AM adversarial two-replica post-STOP start remains G1 BLOCKED.');
