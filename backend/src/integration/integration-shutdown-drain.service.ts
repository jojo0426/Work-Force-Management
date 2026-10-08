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
