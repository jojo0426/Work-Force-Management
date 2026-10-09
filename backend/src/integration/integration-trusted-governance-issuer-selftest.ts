import { strict as assert } from 'assert';
import { generateKeyPairSync, sign } from 'crypto';
import { verifyTrustedGovernanceJwt } from './integration-trusted-governance-issuer';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const now = 1800000000;
const config = {
  issuer: 'https://issuer.example.invalid/wfm-ci',
  audience: 'wfm-worker-governance',
  keyId: 'ci-rsa-key-1',
  publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
};
function token(override: Record<string, unknown> = {}, headerOverride: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: config.keyId,
    ...headerOverride })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({
    iss: config.issuer, aud: config.audience, sub: 'ci_operator',
    sid: 'ci-session-1234567890', role: 'WORKER_GOVERNANCE',
    iat: now - 20, nbf: now - 20, exp: now + 600, ...override,
  })).toString('base64url');
  const input = header + '.' + claims;
  return input + '.' + sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url');
}
assert.equal(verifyTrustedGovernanceJwt(token(), config, now)?.actorId, 'ci_operator');
for (const [name, value] of [
  ['iss', 'https://wrong.invalid'], ['aud', 'other-audience'], ['role', 'VIEWER'],
  ['exp', now - 1], ['nbf', now + 10], ['iat', now + 10],
] as const) assert.equal(verifyTrustedGovernanceJwt(token({ [name]: value }), config, now), null, name);
assert.equal(verifyTrustedGovernanceJwt(token({}, { alg: 'none' }), config, now), null);
assert.equal(verifyTrustedGovernanceJwt(token({}, { jku: 'https://attacker.invalid/key' }), config, now), null);
assert.equal(verifyTrustedGovernanceJwt(token().slice(0, -3) + 'abc', config, now), null);
assert.equal(verifyTrustedGovernanceJwt(token(), { ...config, keyId: 'wrong-key' }, now), null);
console.log('Phase 5E.2AJ pinned issuer verification selftest passed.');
