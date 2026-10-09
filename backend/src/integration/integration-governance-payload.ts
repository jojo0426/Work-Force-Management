import { createHash } from 'crypto';
export type BoundOperation = 'ENROLL' | 'RETIRE';
/** Canonical digest of the precise approved mutation. Never log credentials. */
export function governancePayloadDigest(
  workerId: string, operation: BoundOperation, credentialHash?: string,
): string | null {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(workerId) ||
      (operation === 'ENROLL' && !/^[a-f0-9]{64}$/.test(credentialHash || '')) ||
      (operation === 'RETIRE' && credentialHash !== undefined)) return null;
  const payload = JSON.stringify({
    v: 1, workerId, operation,
    credentialHash: operation === 'ENROLL' ? credentialHash : null,
  });
  return createHash('sha256').update(payload).digest('hex');
}
