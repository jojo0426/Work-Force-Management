import { PrismaClient } from '@prisma/client';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { IntegrationWorkerGovernanceService } from './integration-worker-governance.service';
import { IntegrationGovernedWorkerMutationService } from './integration-governed-worker-mutation.service';
import { TrustedIssuerConfig } from './integration-trusted-governance-issuer';
import { IntegrationCredentialRotationReadinessService } from './integration-credential-rotation-readiness.service';
import { IntegrationLegacyCredentialInventoryService } from './integration-legacy-credential-inventory.service';

function check(label: string, ok: boolean): void {
  if (!ok) throw new Error('FAIL: ' + label);
  console.log('PASS: ' + label);
}
async function main(): Promise<void> {
  if (process.env.GITHUB_ACTIONS !== 'true' ||
      !/\/wfm_ci(?:\?|$)/.test(process.env.DATABASE_URL || '')) {
    throw new Error('Isolated CI PostgreSQL wfm_ci required');
  }
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = 1800000000;
  const issuer: TrustedIssuerConfig = {
    issuer: 'https://issuer.example.invalid/wfm-ci',
    audience: 'wfm-worker-governance',
    keyId: 'synthetic-key-1',
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
  const token = (actor: string, sid: string, claims: Record<string, unknown> = {}) => {
    const header = Buffer.from(JSON.stringify({
      typ: 'JWT', alg: 'RS256', kid: issuer.keyId,
    })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
      iss: issuer.issuer, aud: issuer.audience, sub: actor, sid,
      role: 'WORKER_GOVERNANCE', iat: now - 20, nbf: now - 20, exp: now + 600,
      ...claims,
    })).toString('base64url');
    const data = header + '.' + body;
    return data + '.' + sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
  };
  const a = new PrismaClient(), b = new PrismaClient();
  const id = 'phase5e2ak-' + Date.now(), requestId = 'request-' + id;
  const secret = 'synthetic-rotation-secret-' + id;
  const fingerprint = createHash('sha256').update(secret).digest('hex');
  const proposer = token('proposer_' + id, 'proposer-session-12345678');
  const reviewer = token('reviewer_' + id, 'reviewer-session-12345678');
  const wrongRole = token('reviewer_' + id, 'reviewer-session-12345678', { role: 'VIEWER' });
  const governance = new IntegrationWorkerGovernanceService(a as any);
  const mutation = new IntegrationGovernedWorkerMutationService(b as any);
  try {
    await a.integrationFleetControl.upsert({
      where: { id: 'GLOBAL' },
      create: { id: 'GLOBAL', enabled: false, generation: 0n },
      update: { enabled: false },
    });
    check('untrusted role cannot propose', !(await governance.recordTrustedIssuer(
      id, 'ENROLL', 'PROPOSE', wrongRole, issuer, now, requestId, fingerprint)));
    check('trusted proposer accepted', await governance.recordTrustedIssuer(
      id, 'ENROLL', 'PROPOSE', proposer, issuer, now, requestId, fingerprint));
    check('same proposer cannot approve', !(await governance.recordTrustedIssuer(
      id, 'ENROLL', 'APPROVE', proposer, issuer, now, requestId, fingerprint)));
    check('independent trusted reviewer approved', await governance.recordTrustedIssuer(
      id, 'ENROLL', 'APPROVE', reviewer, issuer, now, requestId, fingerprint));
    check('wrong role cannot apply', !(await mutation.applyTrustedIssuer(
      id, 'ENROLL', wrongRole, issuer, now, requestId, secret)));
    check('wrong request cannot apply', !(await mutation.applyTrustedIssuer(
      id, 'ENROLL', reviewer, issuer, now, 'wrong-' + requestId, secret)));
    check('wrong credential cannot apply', !(await mutation.applyTrustedIssuer(
      id, 'ENROLL', reviewer, issuer, now, requestId, secret + '-altered')));
    check('trusted reviewer can apply approved request once', await mutation.applyTrustedIssuer(
      id, 'ENROLL', reviewer, issuer, now, requestId, secret));
    check('trusted approval cannot replay', !(await mutation.applyTrustedIssuer(
      id, 'ENROLL', reviewer, issuer, now, requestId, secret)));
    const readiness = await new IntegrationCredentialRotationReadinessService(
      a as any, new IntegrationLegacyCredentialInventoryService(a as any)).inspect();
    check('rotation preflight never authorizes rotation or external quiescence',
      !!readiness && readiness.safeToRotate === false &&
      readiness.externallyQuiescent === false);
    console.log('Phase 5E.2AK trusted issuer governance PostgreSQL E2E passed.');
  } finally { await Promise.all([a.$disconnect(), b.$disconnect()]); }
}
main().catch(e => { console.error(e); process.exit(1); });
