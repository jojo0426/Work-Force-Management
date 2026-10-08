import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';

export type VerifiedApprovalActor = Readonly<{
  userId: string;
  sessionHash: string;
  role: 'SUPERVISOR' | 'ADMINISTRATOR';
}>;

/**
 * Internal-only approval recording. The actor must be supplied by a trusted
 * authentication boundary, never directly from a request body.
 */
@Injectable()
export class IntegrationApprovalLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    actor: VerifiedApprovalActor,
    admissionId: string,
    evidenceId: string,
    action: 'PROPOSE' | 'APPROVE',
  ): Promise<boolean> {
    if (!actor?.userId || !actor.sessionHash || !/^[a-f0-9]{64}$/.test(actor.sessionHash) ||
        !['SUPERVISOR', 'ADMINISTRATOR'].includes(actor.role) ||
        !admissionId || !evidenceId || !['PROPOSE', 'APPROVE'].includes(action)) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.findUnique({
          where: { id: actor.userId },
          select: { id: true, isActive: true, role: true },
        });
        if (!user || !user.isActive || user.role !== actor.role) return false;
        const evidence = await tx.integrationProviderEvidence.findUnique({
          where: { id: evidenceId },
        });
        if (!evidence || !evidence.validated || evidence.admissionId !== admissionId) return false;
        if (action === 'PROPOSE' && evidence.operatorId !== actor.userId) return false;
        if (action === 'APPROVE') {
          if (evidence.reviewerId !== actor.userId) return false;
          const proposal = await tx.integrationApprovalEvent.findFirst({
            where: { admissionId, evidenceId, action: 'PROPOSE',
              actorUserId: evidence.operatorId },
          });
          if (!proposal || proposal.actorUserId === actor.userId) return false;
        }
        await tx.integrationApprovalEvent.create({
          data: {
            id: randomUUID(), admissionId, actorUserId: actor.userId,
            evidenceId, action,
            sessionIdHash: actor.sessionHash,
          },
        });
        return true;
      });
    } catch {
      return false;
    }
  }
}
