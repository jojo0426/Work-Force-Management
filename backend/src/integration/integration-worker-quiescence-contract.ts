/**
 * Phase 5E.2AD: provider-independent, read-only worker quiescence model.
 * Synthetic coordination only. This cannot fence sockets or real providers.
 */
export type WorkerObservation = Readonly<{
  workerId: string;
  generation: number;
  acknowledgedStop: boolean;
  activeAttempts: number;
  lastSeenMs: number;
  crashed: boolean;
}>;

export type QuiescenceAssessment = Readonly<{
  admissionsClosed: boolean;
  allWorkersAcknowledged: boolean;
  localWorkersIdle: boolean;
  ledgerEmpty: boolean;
  externallyQuiescent: false;
  escalationRequired: boolean;
  reasons: readonly string[];
}>;

export function assessWorkerQuiescence(input: Readonly<{
  fleetStopped: boolean;
  stopGeneration: number;
  expectedWorkerIds: readonly string[];
  workers: readonly WorkerObservation[];
  unresolvedAdmissions: number | null;
  nowMs: number;
  maxObservationAgeMs: number;
}>): QuiescenceAssessment {
  if (!Number.isSafeInteger(input.stopGeneration) ||
      !Number.isFinite(input.nowMs) ||
      !Number.isFinite(input.maxObservationAgeMs) ||
      input.maxObservationAgeMs < 0 ||
      input.unresolvedAdmissions !== null &&
      (!Number.isSafeInteger(input.unresolvedAdmissions) || input.unresolvedAdmissions < 0)) {
    throw new Error('Invalid quiescence assessment input');
  }
  const reasons: string[] = [];
  if (!input.fleetStopped) reasons.push('FLEET_NOT_STOPPED');
  if (input.unresolvedAdmissions === null) reasons.push('LEDGER_UNAVAILABLE');
  else if (input.unresolvedAdmissions > 0) reasons.push('UNRESOLVED_ADMISSIONS');
  const observed = new Map<string, WorkerObservation>();
  for (const worker of input.workers) {
    if (!worker.workerId || observed.has(worker.workerId)) {
      reasons.push('DUPLICATE_OR_INVALID_WORKER');
      continue;
    }
    observed.set(worker.workerId, worker);
  }
  const expected = new Set(input.expectedWorkerIds);
  if (expected.size !== input.expectedWorkerIds.length ||
      input.expectedWorkerIds.some(id => !id)) reasons.push('INVALID_ROSTER');
  for (const id of observed.keys()) {
    if (!expected.has(id)) reasons.push('UNEXPECTED_WORKER');
  }
  let allWorkersAcknowledged = true;
  let localWorkersIdle = true;
  for (const id of expected) {
    const worker = observed.get(id);
    if (!worker) {
      reasons.push('MISSING_WORKER');
      allWorkersAcknowledged = false;
      localWorkersIdle = false;
      continue;
    }
    const stale = !Number.isFinite(worker.lastSeenMs) ||
      worker.lastSeenMs > input.nowMs ||
      input.nowMs - worker.lastSeenMs > input.maxObservationAgeMs;
    if (worker.crashed || stale) {
      reasons.push(worker.crashed ? 'CRASHED_WORKER' : 'STALE_WORKER');
      allWorkersAcknowledged = false;
      localWorkersIdle = false;
    }
    if (!worker.acknowledgedStop || worker.generation !== input.stopGeneration) {
      reasons.push('STOP_ACK_MISSING_OR_STALE');
      allWorkersAcknowledged = false;
    }
    if (!Number.isSafeInteger(worker.activeAttempts) || worker.activeAttempts !== 0) {
      reasons.push('ACTIVE_OR_INVALID_ATTEMPTS');
      localWorkersIdle = false;
    }
  }
  return {
    admissionsClosed: input.fleetStopped,
    allWorkersAcknowledged,
    localWorkersIdle,
    ledgerEmpty: input.unresolvedAdmissions === 0,
    externallyQuiescent: false,
    escalationRequired: reasons.length > 0,
    reasons: [...new Set(reasons)],
  };
}
