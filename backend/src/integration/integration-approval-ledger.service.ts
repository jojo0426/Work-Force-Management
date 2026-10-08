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
        if (!evidence || evidence.admissionId !== admissionId) return false;
        if (!evidence.validated) {
          if (evidence.provider !== 'MOCK') return false;
          const attribution = await tx.integrationEvidenceAttribution.findMany({
            where: { evidenceId, admissionId },
            select: { action: true, actorUserId: true, sessionHash: true },
          });
          const attestor = attribution.find(event => event.action === 'ATTEST');
          const reviewer = attribution.find(event => event.action === 'REVIEW');
          if (!attestor || !reviewer || attestor.actorUserId === reviewer.actorUserId ||
              attestor.sessionHash === reviewer.sessionHash) return false;
          if (action === 'PROPOSE' && actor.userId !== attestor.actorUserId) return false;
          if (action === 'APPROVE' && actor.userId !== reviewer.actorUserId) return false;
        }
        if (action === 'PROPOSE' && evidence.validated && evidence.operatorId !== actor.userId) return false;
        if (action === 'APPROVE') {
          if (evidence.validated && evidence.reviewerId !== actor.userId) return false;
          const proposal = await tx.integrationApprovalEvent.findFirst({
            where: { admissionId, evidenceId, action: 'PROPOSE',
              actorUserId: evidence.validated ? evidence.operatorId : undefined },
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
