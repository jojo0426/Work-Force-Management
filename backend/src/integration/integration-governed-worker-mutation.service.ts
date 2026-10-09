import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GovernanceOperation } from './integration-worker-governance.service';
import { verifyGovernanceSession } from './integration-governance-session';
import { governancePayloadDigest } from './integration-governance-payload';

const UNRESOLVED = ['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN'] as const;

/**
 * Prototype governance-gated mutations. No public controller, no provider I/O.
 * Governance events must be bound to authenticated users before production use.
 */
@Injectable()
export class IntegrationGovernedWorkerMutationService {
  constructor(private readonly prisma: PrismaService) {}

  /** Legacy caller-asserted reviewer identity is not trusted. */
  async apply(_workerId: string, _operation: GovernanceOperation,
    _approvedBy: string, _secret?: string): Promise<boolean> {
    return false;
  }

  async applyAuthenticated(workerId: string, operation: GovernanceOperation,
    envelope: string, signingKey: string, nowSeconds: number,
    secret?: string, requestId?: string): Promise<boolean> {
    if (requestId !== undefined && !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) return false;
    const actor = verifyGovernanceSession(envelope, signingKey, nowSeconds);
    if (!actor) return false;
    return this.applyVerified(workerId, operation, actor.actorId, secret, requestId);
  }

  private async applyVerified(workerId: string, operation: GovernanceOperation,
    approvedBy: string, secret?: string, requestId?: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(workerId) ||
        !/^[A-Za-z0-9_-]{1,80}$/.test(approvedBy) ||
        !['ENROLL', 'RETIRE'].includes(operation) ||
        (operation === 'ENROLL' && (!secret || secret.length < 32))) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const fleet = await tx.$queryRaw<Array<{ enabled: boolean }>>`
          SELECT "enabled" FROM "IntegrationFleetControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (fleet.length !== 1 || fleet[0].enabled) return false;
        const digest = governancePayloadDigest(workerId, operation as 'ENROLL' | 'RETIRE',
          operation === 'ENROLL' ? createHash('sha256').update(secret!).digest('hex') : undefined);
        if (!digest) return false;
        const events = await tx.integrationWorkerGovernanceEvent.findMany({
          where: { workerId, operation, payloadDigest: digest, requestId },
          orderBy: { createdAt: 'asc' },
        });
        const approval = events.find(a => a.action === 'APPROVE' &&
          a.actorId === approvedBy &&
          events.some(p => p.action === 'PROPOSE' &&
            p.actorId !== a.actorId && p.sessionHash !== a.sessionHash &&
            a.createdAt >= p.createdAt));
        if (!approval) return false;
        const consumed = await tx.integrationWorkerGovernanceConsumption.findUnique({
          where: { approvalEventId: approval.id },
        });
        if (consumed) return false;
        // The unique approvalEventId key serializes competing consumers.
        // Rollback of a rejected mutation also rolls back consumption.
        await tx.integrationWorkerGovernanceConsumption.create({
          data: { approvalEventId: approval.id, workerId, operation, consumedBy: approvedBy },
        });
        if (operation === 'ENROLL') {
          const exists = await tx.integrationExpectedWorker.findUnique({ where: { workerId } });
          if (exists) return false;
          await tx.integrationExpectedWorker.create({
            data: { workerId, approvedBy,
              credentialHash: createHash('sha256').update(secret!).digest('hex') },
          });
          return true;
        }
        const unresolved = await tx.integrationAdmission.count({
          where: { status: { in: [...UNRESOLVED] } },
        });
        if (unresolved !== 0) return false;
        const member = await tx.integrationWorkerMembership.findUnique({ where: { workerId } });
        if (member && member.activeAttempts !== 0) return false;
        const changed = await tx.integrationExpectedWorker.updateMany({
          where: { workerId, retiredAt: null },
          data: { retiredAt: new Date() },
        });
        return changed.count === 1;
      });
    } catch { return false; }
  }
}
