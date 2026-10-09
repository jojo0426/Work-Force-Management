import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma.service';
import { verifyGovernanceSession } from './integration-governance-session';
import { governancePayloadDigest } from './integration-governance-payload';
import { TrustedIssuerConfig, verifyTrustedGovernanceJwt } from './integration-trusted-governance-issuer';

export type GovernanceAction = 'PROPOSE' | 'APPROVE';
export type GovernanceOperation = 'ENROLL' | 'RETIRE' | 'ROTATE';
export type VerifiedGovernanceActor = Readonly<{
  actorId: string; sessionHash: string; privileged: boolean;
}>;

/** Internal ledger only. Actor identity MUST originate from verified auth. */
@Injectable()
export class IntegrationWorkerGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Unverified actor-object API is closed to prevent identity spoofing. */
  async record(_workerId: string, _operation: GovernanceOperation,
    _action: GovernanceAction, _actor: VerifiedGovernanceActor): Promise<boolean> {
    return false;
  }

  async recordAuthenticated(workerId: string, operation: GovernanceOperation,
    action: GovernanceAction, envelope: string, signingKey: string,
    nowSeconds: number, credentialHash?: string, requestId?: string): Promise<boolean> {
    // Synthetic identity is restricted to explicit isolated CI fixture runs.
    if (process.env.GITHUB_ACTIONS !== 'true' ||
        process.env.WFM_SYNTHETIC_GOVERNANCE_FIXTURE !== 'true' ||
        !/\\/wfm_ci(?:\\?|$)/.test(process.env.DATABASE_URL || '')) return false;
    const actor = verifyGovernanceSession(envelope, signingKey, nowSeconds);
    if (!actor) return false;
    const digest = operation === 'ROTATE' ?
      createHash('sha256').update('ROTATE:' + workerId).digest('hex') :
      governancePayloadDigest(workerId, operation, credentialHash);
    if (!digest || !requestId || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) return false;
    return this.recordVerified(workerId, operation, action, actor, digest, requestId);
  }

  /**
   * Trusted-key cutover prototype. No HTTP controller or live issuer is configured.
   * Issuer config must be injected by an authenticated deployment controller.
   */
  async recordTrustedIssuer(workerId: string, operation: GovernanceOperation,
    action: GovernanceAction, jwt: string, issuer: TrustedIssuerConfig,
    nowSeconds: number, requestId: string, credentialHash?: string): Promise<boolean> {
    const actor = verifyTrustedGovernanceJwt(jwt, issuer, nowSeconds);
    if (!actor || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) return false;
    const digest = operation === 'ROTATE' ?
      createHash('sha256').update('ROTATE:' + workerId).digest('hex') :
      governancePayloadDigest(workerId, operation, credentialHash);
    if (!digest) return false;
    return this.recordVerified(workerId, operation, action, actor, digest, requestId);
  }

  private async recordVerified(workerId: string, operation: GovernanceOperation,
    action: GovernanceAction, actor: VerifiedGovernanceActor,
    payloadDigest: string, requestId: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(workerId) ||
        !['ENROLL', 'RETIRE', 'ROTATE'].includes(operation) ||
        !['PROPOSE', 'APPROVE'].includes(action) ||
        !actor.privileged || !actor.actorId ||
        !/^[a-f0-9]{64}$/.test(actor.sessionHash)) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const control = await tx.$queryRaw<Array<{ enabled: boolean }>>`
          SELECT "enabled" FROM "IntegrationFleetControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (control.length !== 1 || control[0].enabled) return false;
        if (action === 'APPROVE') {
          const proposals = await tx.integrationWorkerGovernanceEvent.findMany({
            where: { workerId, operation, action: 'PROPOSE', payloadDigest, requestId },
          });
          if (!proposals.some(p => p.actorId !== actor.actorId &&
              p.sessionHash !== actor.sessionHash)) return false;
        }
        await tx.integrationWorkerGovernanceEvent.create({
          data: { workerId, operation, action, actorId: actor.actorId,
            sessionHash: actor.sessionHash, payloadDigest, requestId },
        });
        return true;
      });
    } catch { return false; }
  }

  async hasIndependentApproval(workerId: string, operation: GovernanceOperation): Promise<boolean> {
    try {
      const events = await this.prisma.integrationWorkerGovernanceEvent.findMany({
        where: { workerId, operation },
      });
      return events.some(proposal => proposal.action === 'PROPOSE' &&
        events.some(review => review.action === 'APPROVE' &&
          review.actorId !== proposal.actorId &&
          review.sessionHash !== proposal.sessionHash &&
          review.createdAt >= proposal.createdAt));
    } catch { return false; }
  }
}
