export const MANAGEMENT_ESCALATION_POLICY = {
  cooldownSeconds: 15 * 60,
  audience: 'MANAGEMENT',
  channel: 'IN_APP',
  requiresHumanAction: true,
} as const;

export type EscalationSignal = {
  kind: string;
  technicianId?: string | null;
  workOrderNumber?: string | null;
};

export function escalationKey(signal: EscalationSignal) {
  return [signal.kind, signal.technicianId || 'none', signal.workOrderNumber || 'none'].join(':');
}

export function escalationMetadata(signal: EscalationSignal) {
  return {
    dedupeKey: escalationKey(signal),
    notification: MANAGEMENT_ESCALATION_POLICY,
  };
}
