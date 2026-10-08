import { Injectable } from '@nestjs/common';
import { IntegrationFleetControlService } from './integration-fleet-control.service';

export type ShutdownDrainOutcome = Readonly<{
  admissionsClosed: boolean;
  externallyDrained: false;
  ledgerEmpty: boolean;
  unresolvedAttempts: number | null;
  escalated: boolean;
  reason: 'STOP_FAILED' | 'LEDGER_UNAVAILABLE' | 'UNRESOLVED_ATTEMPTS' | 'LEDGER_EMPTY_NOT_NETWORK_PROOF';
}>;

/**
 * Bounded, read-only ledger assessment following a durable stop.
 * Never auto-reconciles or activates a provider.
 */
@Injectable()
export class IntegrationShutdownDrainService {
  constructor(private readonly fleet: IntegrationFleetControlService) {}

  /**
   * Bounded ledger polling with injected clock/sleep for deterministic tests.
   * It never reports externallyDrained=true; a deadline returns escalation.
   */
  async stopAndWaitForLedger(
    actor: string,
    reasonCode: string,
    options: {
      timeoutMs: number;
      pollIntervalMs: number;
      now?: () => number;
      sleep?: (ms: number) => Promise<void>;
    },
  ): Promise<ShutdownDrainOutcome & { timedOut: boolean; polls: number }> {
    const timeout = options.timeoutMs;
    const interval = options.pollIntervalMs;
    if (!Number.isInteger(timeout) || timeout < 0 || timeout > 300_000 ||
        !Number.isInteger(interval) || interval < 1 || interval > 30_000) {
      throw new Error('Bounded shutdown requires valid timeout and polling interval');
    }
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
    const deadline = now() + timeout;
    let result = await this.stopAndAssess(actor, reasonCode);
    let polls = 1;
    while (result.admissionsClosed && result.unresolvedAttempts !== null &&
           result.unresolvedAttempts > 0 && now() < deadline) {
      await sleep(Math.min(interval, Math.max(0, deadline - now())));
      const snapshot = await this.fleet.inspectStopSafety();
      polls += 1;
      if (!snapshot.admissionsClosed || snapshot.unresolvedAttempts === null) {
        return {
          admissionsClosed: snapshot.admissionsClosed, externallyDrained: false,
          ledgerEmpty: false, unresolvedAttempts: snapshot.unresolvedAttempts,
          escalated: true, reason: 'LEDGER_UNAVAILABLE',
          timedOut: false, polls,
        };
      }
      result = snapshot.unresolvedAttempts === 0
        ? { admissionsClosed: true, externallyDrained: false, ledgerEmpty: true,
            unresolvedAttempts: 0, escalated: false,
            reason: 'LEDGER_EMPTY_NOT_NETWORK_PROOF' }
        : { admissionsClosed: true, externallyDrained: false, ledgerEmpty: false,
            unresolvedAttempts: snapshot.unresolvedAttempts, escalated: true,
            reason: 'UNRESOLVED_ATTEMPTS' };
    }
    return {
      ...result,
      timedOut: result.unresolvedAttempts !== null &&
        result.unresolvedAttempts > 0 && now() >= deadline,
      polls,
    };
  }

  async stopAndAssess(actor: string, reasonCode: string): Promise<ShutdownDrainOutcome> {
    const stopped = await this.fleet.stopAndInspect(actor, reasonCode);
    if (!stopped.acknowledged) return {
      admissionsClosed: false, externallyDrained: false,
      ledgerEmpty: false, unresolvedAttempts: stopped.unresolvedAttempts,
      escalated: true, reason: 'STOP_FAILED',
    };
    if (stopped.unresolvedAttempts === null) return {
      admissionsClosed: true, externallyDrained: false,
      ledgerEmpty: false, unresolvedAttempts: null,
      escalated: true, reason: 'LEDGER_UNAVAILABLE',
    };
    if (stopped.unresolvedAttempts > 0) return {
      admissionsClosed: true, externallyDrained: false,
      ledgerEmpty: false, unresolvedAttempts: stopped.unresolvedAttempts,
      escalated: true, reason: 'UNRESOLVED_ATTEMPTS',
    };
    return {
      admissionsClosed: true, externallyDrained: false,
      ledgerEmpty: true, unresolvedAttempts: 0,
      escalated: false, reason: 'LEDGER_EMPTY_NOT_NETWORK_PROOF',
    };
  }
}
