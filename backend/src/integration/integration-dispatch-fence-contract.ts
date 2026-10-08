/**
 * Phase 5E.2AC: provider-independent fencing semantics.
 *
 * This module models the safety boundary, not a production transport.
 * PostgreSQL can serialize admission and stop; it cannot atomically
 * serialize an external socket send. Never infer quiescence from a lease.
 */
export type DispatchPhase =
  | 'NOT_ADMITTED'
  | 'AUTHORIZED'
  | 'SEND_INTENT_DURABLE'
  | 'REQUEST_MAY_HAVE_STARTED'
  | 'CONFIRMED_COMPLETE'
  | 'OUTCOME_UNKNOWN';

export type StopContract =
  | 'ADMISSIONS_CLOSED'
  | 'EXTERNAL_QUIESCENCE_VERIFIED';

export type FencingState = Readonly<{
  enabled: boolean;
  generation: number;
  phase: DispatchPhase;
  stopAcknowledged: boolean;
  externalStartObserved: boolean;
  providerFenceVerified: boolean;
}>;

export function canAdmit(state: FencingState, generation: number): boolean {
  return state.enabled && !state.stopAcknowledged &&
    generation === state.generation;
}

/** Local stop never proves that a provider-side request was prevented. */
export function acknowledgeLocalStop(state: FencingState): FencingState {
  return { ...state, enabled: false, generation: state.generation + 1,
    stopAcknowledged: true, providerFenceVerified: false };
}

/** Durable intent precedes any possible external I/O. */
export function recordSendIntent(state: FencingState): FencingState {
  if (state.phase !== 'AUTHORIZED') throw new Error('Not authorized');
  return { ...state, phase: 'SEND_INTENT_DURABLE' };
}

/**
 * An already-authorized sender may be delayed until after local STOP.
 * This function records an observation, not permission to send.
 */
export function observeExternalStart(state: FencingState): FencingState {
  if (state.phase !== 'SEND_INTENT_DURABLE') throw new Error('Missing durable intent');
  return { ...state, phase: 'REQUEST_MAY_HAVE_STARTED', externalStartObserved: true };
}

export function reportedStopContract(state: FencingState): StopContract | null {
  if (!state.stopAcknowledged) return null;
  return state.providerFenceVerified
    ? 'EXTERNAL_QUIESCENCE_VERIFIED'
    : 'ADMISSIONS_CLOSED';
}

/**
 * Only an independently verified provider fence could upgrade the contract.
 * No such provider capability exists in the current WFM integration.
 */
export function requireProviderFenceEvidence(_state: FencingState): never {
  throw new Error('No verified provider fence configured');
}
