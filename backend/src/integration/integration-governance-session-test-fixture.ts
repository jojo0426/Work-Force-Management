import { createHmac } from 'crypto';
export const CI_GOVERNANCE_KEY = 'ci-synthetic-governance-key-never-use-in-production-0123456789';
export const CI_NOW = 1800000000;
export function syntheticGovernanceSession(actorId: string, sid: string,
  overrides: Record<string, unknown> = {}): string {
  const payload = Buffer.from(JSON.stringify({
    sub: actorId, sid, role: 'WORKER_GOVERNANCE',
    aud: 'wfm-worker-governance', iat: CI_NOW - 30, exp: CI_NOW + 600,
    ...overrides,
  })).toString('base64url');
  return payload + '.' + createHmac('sha256', CI_GOVERNANCE_KEY)
    .update(payload).digest('hex');
}
