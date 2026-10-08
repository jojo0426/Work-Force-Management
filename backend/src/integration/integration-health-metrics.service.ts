import { Injectable } from '@nestjs/common';

export type IntegrationOutcome = 'EXECUTED' | 'BLOCKED' | 'TRANSIENT' | 'PERMANENT' | 'TIMEOUT' | 'INVALID_RESPONSE';
export type IntegrationHealthSnapshot = {
  readonly total: number;
  readonly counts: Readonly<Record<IntegrationOutcome, number>>;
  readonly alerts: readonly ('FAILURE_THRESHOLD' | 'TIMEOUT_THRESHOLD')[];
};

// Aggregated counters only: never store job IDs, payloads, error text, tokens or subscriber data.
@Injectable()
export class IntegrationHealthMetricsService {
  private readonly counts: Record<IntegrationOutcome, number> = {
    EXECUTED: 0, BLOCKED: 0, TRANSIENT: 0, PERMANENT: 0, TIMEOUT: 0, INVALID_RESPONSE: 0,
  };

  record(outcome: IntegrationOutcome): void {
    if (!Object.prototype.hasOwnProperty.call(this.counts, outcome)) {
      throw new Error('Invalid integration outcome');
    }
    this.counts[outcome] += 1;
  }

  snapshot(failureThreshold = 5, timeoutThreshold = 3): IntegrationHealthSnapshot {
    if (!Number.isSafeInteger(failureThreshold) || failureThreshold <= 0 ||
        !Number.isSafeInteger(timeoutThreshold) || timeoutThreshold <= 0) {
      throw new Error('Integration alert thresholds must be positive integers');
    }
    const counts = { ...this.counts };
    const failures = counts.TRANSIENT + counts.PERMANENT + counts.TIMEOUT + counts.INVALID_RESPONSE;
    const alerts: ('FAILURE_THRESHOLD' | 'TIMEOUT_THRESHOLD')[] = [];
    if (failures >= failureThreshold) alerts.push('FAILURE_THRESHOLD');
    if (counts.TIMEOUT >= timeoutThreshold) alerts.push('TIMEOUT_THRESHOLD');
    return { total: Object.values(counts).reduce((a, b) => a + b, 0), counts, alerts };
  }
}
