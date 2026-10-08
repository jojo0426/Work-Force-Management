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
        !safe(input.evidenceRef) || !safe(input.reasonCode) ||
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
