import { assessWorkerQuiescence, WorkerObservation } from './integration-worker-quiescence-contract';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
const nowMs = 10_000;
const stoppedGeneration = 9;
const worker = (workerId: string): WorkerObservation => ({
  workerId, generation: stoppedGeneration, acknowledgedStop: true,
  activeAttempts: 0, lastSeenMs: nowMs, crashed: false,
});
const base = {
  fleetStopped: true, stopGeneration: stoppedGeneration,
  expectedWorkerIds: ['replica-a', 'replica-b'],
  workers: [worker('replica-a'), worker('replica-b')],
  unresolvedAdmissions: 0, nowMs, maxObservationAgeMs: 1000,
};
function main(): void {
  const idle = assessWorkerQuiescence(base);
  check('both replicas acknowledged and idle', idle.allWorkersAcknowledged &&
    idle.localWorkersIdle && idle.ledgerEmpty && !idle.escalationRequired);
  check('even all idle replicas never prove provider quiescence',
    idle.externallyQuiescent === false);
  const missing = assessWorkerQuiescence({ ...base, workers: [worker('replica-a')] });
  check('missing replica escalated', missing.escalationRequired &&
    missing.reasons.includes('MISSING_WORKER'));
  const crashed = assessWorkerQuiescence({ ...base,
    workers: [worker('replica-a'), { ...worker('replica-b'), crashed: true }] });
  check('crashed replica escalated despite zero active attempts',
    crashed.reasons.includes('CRASHED_WORKER') && !crashed.localWorkersIdle);
  const stale = assessWorkerQuiescence({ ...base,
    workers: [worker('replica-a'), { ...worker('replica-b'), lastSeenMs: 8000 }] });
  check('expired heartbeat is unknown not drained', stale.reasons.includes('STALE_WORKER'));
  const staleGeneration = assessWorkerQuiescence({ ...base,
    workers: [worker('replica-a'), { ...worker('replica-b'), generation: 8 }] });
  check('stale stop acknowledgment denied',
    staleGeneration.reasons.includes('STOP_ACK_MISSING_OR_STALE'));
  const active = assessWorkerQuiescence({ ...base,
    workers: [worker('replica-a'), { ...worker('replica-b'), activeAttempts: 1 }] });
  check('in-flight callback blocks local idle',
    active.reasons.includes('ACTIVE_OR_INVALID_ATTEMPTS'));
  const unresolved = assessWorkerQuiescence({ ...base, unresolvedAdmissions: 1 });
  check('unresolved admission escalated despite idle replicas',
    unresolved.reasons.includes('UNRESOLVED_ADMISSIONS'));
  const unavailable = assessWorkerQuiescence({ ...base, unresolvedAdmissions: null });
  check('database outage fails closed', unavailable.reasons.includes('LEDGER_UNAVAILABLE'));
  const enabled = assessWorkerQuiescence({ ...base, fleetStopped: false });
  check('fleet still enabled cannot be called stopped',
    !enabled.admissionsClosed && enabled.reasons.includes('FLEET_NOT_STOPPED'));
  const duplicate = assessWorkerQuiescence({ ...base,
    workers: [worker('replica-a'), worker('replica-a'), worker('replica-b')] });
  check('duplicate worker observations rejected',
    duplicate.reasons.includes('DUPLICATE_OR_INVALID_WORKER'));
  const unexpected = assessWorkerQuiescence({ ...base,
    workers: [...base.workers, worker('replica-c')] });
  check('unregistered worker escalated',
    unexpected.reasons.includes('UNEXPECTED_WORKER'));
  const emptyRoster = assessWorkerQuiescence({ ...base,
    expectedWorkerIds: [], workers: [] });
  check('empty roster cannot certify provider quiescence',
    emptyRoster.externallyQuiescent === false);
  console.log('Phase 5E.2AD multi-replica quiescence contract passed.');
}
main();
