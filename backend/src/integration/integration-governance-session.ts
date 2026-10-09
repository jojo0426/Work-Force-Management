import { createHmac, timingSafeEqual, createHash } from 'crypto';

export type GovernanceIdentity = Readonly<{
  actorId: string; sessionHash: string; privileged: true;
}>;

/**
 * Synthetic authenticated boundary. Secret must be supplied by a trusted
 * controller; no production issuer or secret manager is integrated.
 * Compact signed envelope: base64url(JSON).hex(HMAC-SHA256).
 */
export function verifyGovernanceSession(
  envelope: string, signingKey: string, nowSeconds: number,
): GovernanceIdentity | null {
  if (!signingKey || signingKey.length < 32 || !Number.isSafeInteger(nowSeconds)) return null;
  const pieces = envelope.split('.');
  if (pieces.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(pieces[0]) ||
      !/^[a-f0-9]{64}$/.test(pieces[1])) return null;
  const expected = createHmac('sha256', signingKey).update(pieces[0]).digest();
  if (!timingSafeEqual(expected, Buffer.from(pieces[1], 'hex'))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(pieces[0], 'base64url').toString('utf8')) as {
      sub?: unknown; sid?: unknown; role?: unknown; aud?: unknown;
      iat?: unknown; exp?: unknown;
    };
    if (typeof parsed.sub !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(parsed.sub) ||
        typeof parsed.sid !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(parsed.sid) ||
        parsed.role !== 'WORKER_GOVERNANCE' || parsed.aud !== 'wfm-worker-governance' ||
        typeof parsed.iat !== 'number' || typeof parsed.exp !== 'number' ||
        !Number.isSafeInteger(parsed.iat) || !Number.isSafeInteger(parsed.exp) ||
        parsed.iat > nowSeconds || parsed.exp <= nowSeconds ||
        parsed.exp - parsed.iat > 900) return null;
    return { actorId: parsed.sub,
      sessionHash: createHash('sha256').update(parsed.sid).digest('hex'),
      privileged: true };
  } catch { return null; }
}
