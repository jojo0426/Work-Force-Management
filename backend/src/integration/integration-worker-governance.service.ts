import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export type GovernanceAction = 'PROPOSE' | 'APPROVE';
export type GovernanceOperation = 'ENROLL' | 'RETIRE' | 'ROTATE';
export type VerifiedGovernanceActor = Readonly<{
  actorId: string; sessionHash: string; privileged: boolean;
}>;

/** Internal ledger only. Actor identity MUST originate from verified auth. */
@Injectable()
export class IntegrationWorkerGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async record(workerId: string, operation: GovernanceOperation,
    action: GovernanceAction, actor: VerifiedGovernanceActor): Promise<boolean> {
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
            where: { workerId, operation, action: 'PROPOSE' },
          });
          if (!proposals.some(p => p.actorId !== actor.actorId &&
              p.sessionHash !== actor.sessionHash)) return false;
        }
        await tx.integrationWorkerGovernanceEvent.create({
          data: { workerId, operation, action, actorId: actor.actorId,
            sessionHash: actor.sessionHash },
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
