import {
  FencingState, acknowledgeLocalStop, canAdmit, observeExternalStart,
  recordSendIntent, reportedStopContract, requireProviderFenceEvidence,
} from './integration-dispatch-fence-contract';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
function initial(): FencingState {
  return {
    enabled: true, generation: 7, phase: 'AUTHORIZED',
    stopAcknowledged: false, externalStartObserved: false,
    providerFenceVerified: false,
  };
}
function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}
function main(): void {
  const initialState = initial();
  check('matching generation admits before stop', canAdmit(initialState, 7));
  check('stale generation denied', !canAdmit(initialState, 6));
  check('future generation denied', !canAdmit(initialState, 8));
  check('missing durable intent blocks external start',
    throws(() => observeExternalStart(initialState)));
  const authorized = recordSendIntent(initialState);
  check('durable send intent recorded', authorized.phase === 'SEND_INTENT_DURABLE');
  const stopped = acknowledgeLocalStop(authorized);
  check('stop closes admission and increments generation',
    !canAdmit(stopped, 7) && !canAdmit(stopped, 8) &&
    stopped.generation === 8);
  check('stop reports admission closure only',
    reportedStopContract(stopped) === 'ADMISSIONS_CLOSED');
  const delayed = observeExternalStart(stopped);
  check('adversarial pause exposes post-stop external start',
    delayed.externalStartObserved && delayed.stopAcknowledged);
  check('external start cannot upgrade shutdown guarantee',
    reportedStopContract(delayed) === 'ADMISSIONS_CLOSED');
  check('cannot forge provider quiescence via local contract',
    throws(() => requireProviderFenceEvidence(delayed)));
  check('duplicate send intent denied',
    throws(() => recordSendIntent(authorized)));
  check('stop before admission blocks new work',
    !canAdmit(acknowledgeLocalStop(initial()), 7));
  check('no stop contract before acknowledgment',
    reportedStopContract(initialState) === null);
  check('unknown outcome never proves provider quiescence',
    reportedStopContract({ ...delayed, phase: 'OUTCOME_UNKNOWN' }) === 'ADMISSIONS_CLOSED');
  console.log('Phase 5E.2AC provider-independent fencing contract passed.');
}
main();
