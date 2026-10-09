import { createHash, createPublicKey, verify, KeyObject } from 'crypto';
import type { GovernanceIdentity } from './integration-governance-session';

export type TrustedIssuerConfig = Readonly<{
  issuer: string; audience: string; keyId: string; publicKeyPem: string;
}>;

/**
 * Offline, pinned-key RS256 JWT verifier prototype.
 * Key material and issuer configuration MUST come from trusted deployment config.
 * Does not fetch JWKS or implement production revocation.
 */
export function verifyTrustedGovernanceJwt(
  token: string, config: TrustedIssuerConfig, nowSeconds: number,
): GovernanceIdentity | null {
  if (!Number.isSafeInteger(nowSeconds) || !config.issuer || !config.audience ||
      !config.keyId || !config.publicKeyPem || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every(p => /^[A-Za-z0-9_-]+$/.test(p))) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (header.alg !== 'RS256' || header.typ !== 'JWT' || header.kid !== config.keyId ||
        header.jwk || header.jku || header.x5u || header.crit) return null;
    const key: KeyObject = createPublicKey(config.publicKeyPem);
    if (key.asymmetricKeyType !== 'rsa' ||
        (key.asymmetricKeyDetails?.modulusLength || 0) < 2048) return null;
    if (!verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
      key, Buffer.from(parts[2], 'base64url'))) return null;
    if (claims.iss !== config.issuer || claims.aud !== config.audience ||
        claims.role !== 'WORKER_GOVERNANCE' ||
        typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(claims.sub) ||
        typeof claims.sid !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(claims.sid) ||
        !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.nbf) ||
        !Number.isSafeInteger(claims.exp) || claims.iat > nowSeconds ||
        claims.nbf > nowSeconds || claims.exp <= nowSeconds ||
        claims.exp - claims.iat > 900 || claims.exp <= claims.iat) return null;
    return { actorId: claims.sub,
      sessionHash: createHash('sha256').update(config.issuer + ':' + claims.sid).digest('hex'),
      privileged: true };
  } catch { return null; }
}
