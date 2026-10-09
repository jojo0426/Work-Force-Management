import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { GovernanceOperation } from './integration-worker-governance.service';

const UNRESOLVED = ['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN'] as const;

/**
 * Prototype governance-gated mutations. No public controller, no provider I/O.
 * Governance events must be bound to authenticated users before production use.
 */
@Injectable()
export class IntegrationGovernedWorkerMutationService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(workerId: string, operation: GovernanceOperation,
    approvedBy: string, secret?: string): Promise<boolean> {
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
        const events = await tx.integrationWorkerGovernanceEvent.findMany({
          where: { workerId, operation },
          orderBy: { createdAt: 'asc' },
        });
        const approved = events.some(p => p.action === 'PROPOSE' &&
          events.some(a => a.action === 'APPROVE' &&
            a.actorId === approvedBy && a.actorId !== p.actorId &&
            a.sessionHash !== p.sessionHash && a.createdAt >= p.createdAt));
        if (!approved) return false;
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
