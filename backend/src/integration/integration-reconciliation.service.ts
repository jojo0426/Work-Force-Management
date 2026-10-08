import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import {
  ProviderIdempotencyEvidence,
  providerIsSafeForAutomatedReconciliation,
} from './provider-idempotency-evidence';

export type ReconciliationDecision = Readonly<{
  admissionId: string;
  operatorId: string;
  reviewerId: string;
  provider: string;
  providerRequestId: string;
  outcome: 'CONFIRMED_APPLIED' | 'CONFIRMED_NOT_APPLIED';
  evidenceRef: string;
  reasonCode: string;
  providerEvidence: ProviderIdempotencyEvidence;
  trustedEvidenceId: string;
}>;

/**
 * Internal-only resolution foundation. No controller exposes this service.
 * Provider evidence is caller-supplied and NOT independently attested yet.
 */
@Injectable()
export class IntegrationReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveWithEvidence(input: ReconciliationDecision): Promise<boolean> {
    const safe = (value: string) => typeof value === 'string' &&
      /^[A-Za-z0-9_./:@-]{3,180}$/.test(value);
    if (!safe(input.admissionId) || !safe(input.operatorId) ||
        !safe(input.reviewerId) || input.operatorId === input.reviewerId ||
        !safe(input.provider) || !safe(input.providerRequestId) ||
        !safe(input.evidenceRef) || !safe(input.trustedEvidenceId) || !safe(input.reasonCode) ||
        !['CONFIRMED_APPLIED', 'CONFIRMED_NOT_APPLIED'].includes(input.outcome) ||
        input.providerEvidence.provider !== input.provider ||
        !providerIsSafeForAutomatedReconciliation(input.providerEvidence)) return false;

    try {
      return await this.prisma.$transaction(async tx => {
        const control = await tx.$queryRaw<Array<{ enabled: boolean }>>`
          SELECT "enabled" FROM "IntegrationFleetControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (control.length !== 1 || control[0].enabled !== false) return false;
        const attempts = await tx.$queryRaw<Array<{ id: string; jobId: string; status: string }>>`
          SELECT "id", "jobId", "status" FROM "IntegrationAdmission"
          WHERE "id" = ${input.admissionId} FOR UPDATE
        `;
        if (attempts.length !== 1 ||
            !['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN'].includes(attempts[0].status)) return false;
        const job = await tx.integrationJob.findUnique({
          where: { id: attempts[0].jobId },
          select: { status: true },
        });
        // Prevent an operator from masking an actively processing claim.
        if (!job || job.status === 'PROCESSING') return false;
        // Registry evidence is a persisted independent record, not the caller's
        // assertion. Both approval identities must be distinct and recorded.
        const trusted = await tx.integrationProviderEvidence.findUnique({
          where: { id: input.trustedEvidenceId },
        });
        if (!trusted || trusted.admissionId !== input.admissionId ||
            trusted.provider !== input.provider ||
            trusted.providerRequestId !== input.providerRequestId ||
            trusted.evidenceRef !== input.evidenceRef ||
            trusted.confirmedOutcome !== input.outcome) return false;
        if (trusted.validated) {
          if (trusted.operatorId !== input.operatorId ||
              trusted.reviewerId !== input.reviewerId ||
              trusted.operatorId === trusted.reviewerId) return false;
        } else {
          // Pending mock evidence is usable only with two immutable
          // independently authenticated attribution events.
          if (trusted.provider !== 'MOCK') return false;
          const attributions = await tx.integrationEvidenceAttribution.findMany({
            where: { evidenceId: input.trustedEvidenceId, admissionId: input.admissionId },
            select: { action: true, actorUserId: true, sessionHash: true },
          });
          const attestor = attributions.find(event =>
            event.action === 'ATTEST' && event.actorUserId === input.operatorId);
          const reviewer = attributions.find(event =>
            event.action === 'REVIEW' && event.actorUserId === input.reviewerId);
          if (!attestor || !reviewer ||
              attestor.actorUserId === reviewer.actorUserId ||
              attestor.sessionHash === reviewer.sessionHash) return false;
        }
        // Resolve operator identities from current database users rather than
        // trusting caller-declared roles. This is not session authentication.
        const approvers = await tx.user.findMany({
          where: {
            id: { in: [input.operatorId, input.reviewerId] },
            isActive: true,
            role: { in: ['SUPERVISOR', 'ADMINISTRATOR'] },
          },
          select: { id: true },
        });
        if (approvers.length !== 2 ||
            !approvers.some(user => user.id === input.operatorId) ||
            !approvers.some(user => user.id === input.reviewerId)) return false;
        const approvals = await tx.integrationApprovalEvent.findMany({
          where: {
            admissionId: input.admissionId,
            evidenceId: input.trustedEvidenceId,
            OR: [
              { action: 'PROPOSE', actorUserId: input.operatorId },
              { action: 'APPROVE', actorUserId: input.reviewerId },
            ],
          },
          select: { action: true, actorUserId: true, sessionIdHash: true },
        });
        const proposal = approvals.find(event =>
          event.action === 'PROPOSE' && event.actorUserId === input.operatorId);
        const approval = approvals.find(event =>
          event.action === 'APPROVE' && event.actorUserId === input.reviewerId);
        if (!proposal || !approval || proposal.sessionIdHash === approval.sessionIdHash) return false;
        await tx.integrationReconciliationAudit.create({
          data: {
            id: randomUUID(), admissionId: input.admissionId,
            jobId: attempts[0].jobId, provider: input.provider,
            providerRequestId: input.providerRequestId,
            outcome: input.outcome, evidenceRef: input.evidenceRef,
            operatorId: input.operatorId, reviewerId: input.reviewerId,
            reasonCode: input.reasonCode,
          },
        });
        const changed = await tx.integrationAdmission.updateMany({
          where: { id: input.admissionId, status: attempts[0].status },
          data: { status: 'RECONCILED', releasedAt: new Date() },
        });
        if (changed.count !== 1) throw new Error('Reconciliation concurrency conflict');
        return true;
      }, { maxWait: 5_000, timeout: 10_000 });
    } catch {
      return false;
    }
  }
}
