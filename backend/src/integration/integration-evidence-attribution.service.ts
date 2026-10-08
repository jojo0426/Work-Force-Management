import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { VerifiedApprovalActor } from './integration-approval-ledger.service';

/**
 * Append-only, JWT-bound attestation of already ingested synthetic evidence.
 * The evidence row itself stays immutable and unvalidated.
 */
@Injectable()
export class IntegrationEvidenceAttributionService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    actor: VerifiedApprovalActor,
    evidenceId: string,
    action: 'ATTEST' | 'REVIEW',
  ): Promise<boolean> {
    if (!actor?.userId || !/^[a-f0-9]{64}$/.test(actor.sessionHash) ||
        !['SUPERVISOR', 'ADMINISTRATOR'].includes(actor.role) ||
        !evidenceId || !['ATTEST', 'REVIEW'].includes(action)) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const user = await tx.user.findUnique({ where: { id: actor.userId } });
        if (!user || !user.isActive || user.role !== actor.role) return false;
        const evidence = await tx.integrationProviderEvidence.findUnique({
          where: { id: evidenceId },
        });
        if (!evidence || evidence.provider !== 'MOCK' || evidence.validated) return false;
        const control = await tx.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
        if (!control || control.enabled) return false;
        const admission = await tx.integrationAdmission.findUnique({
          where: { id: evidence.admissionId },
        });
        if (!admission || !['UNCERTAIN', 'IN_FLIGHT', 'MAY_HAVE_DISPATCHED']
          .includes(admission.status)) return false;
        if (action === 'REVIEW') {
          const attestation = await tx.integrationEvidenceAttribution.findFirst({
            where: { evidenceId, action: 'ATTEST' },
          });
          if (!attestation || attestation.actorUserId === actor.userId ||
              attestation.sessionHash === actor.sessionHash) return false;
        }
        await tx.integrationEvidenceAttribution.create({
          data: {
            id: randomUUID(), evidenceId, admissionId: evidence.admissionId,
            actorUserId: actor.userId, action, sessionHash: actor.sessionHash,
          },
        });
        return true;
      });
    } catch {
      return false;
    }
  }
}
