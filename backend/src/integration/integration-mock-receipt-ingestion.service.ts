import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { ProviderReceipt } from './provider-receipt-authenticity';
import { IntegrationMockKeyVerifierService, MockSigningKeyCandidate } from './integration-mock-key-verifier.service';

export type MockReceiptIngestion = Readonly<{
  admissionId: string;
  operatorId: string;
  reviewerId: string;
  evidenceRef: string;
  receipt: ProviderReceipt;
  signatureHex: string;
}>;

/**
 * Internal synthetic-only ingestion. Secret must be injected by a trusted
 * runtime; no HTTP route accepts or configures the secret.
 */
@Injectable()
export class IntegrationMockReceiptIngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keys: IntegrationMockKeyVerifierService,
  ) {}

  async ingest(
    input: MockReceiptIngestion,
    key: MockSigningKeyCandidate,
    nowSeconds: number,
  ): Promise<{ accepted: boolean; evidenceId: string | null }> {
    if (!input || !input.admissionId || !input.operatorId ||
        !input.reviewerId || input.operatorId === input.reviewerId ||
        !/^[A-Za-z0-9_./:@-]{3,180}$/.test(input.evidenceRef) ||
        !(await this.keys.verify(input.receipt, input.signatureHex, key, nowSeconds))) {
      return { accepted: false, evidenceId: null };
    }
    try {
      return await this.prisma.$transaction(async tx => {
        const control = await tx.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
        if (!control || control.enabled) return { accepted: false, evidenceId: null };
        const admission = await tx.integrationAdmission.findUnique({
          where: { id: input.admissionId },
        });
        if (!admission || !['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN']
          .includes(admission.status)) return { accepted: false, evidenceId: null };
        const job = await tx.integrationJob.findUnique({ where: { id: admission.jobId } });
        if (!job || job.targetSystem !== 'MOCK' || job.status === 'PROCESSING' ||
            !job.payload || typeof job.payload !== 'object' ||
            Array.isArray(job.payload) ||
            (job.payload as Record<string, unknown>).mockRequestId !== input.receipt.requestId) {
          return { accepted: false, evidenceId: null };
        }
        // Do not trust a caller's claim that this receipt belongs to a job:
        // bind it to a durable attempt key and explicit mock target.
        const evidenceId = randomUUID();
        await tx.integrationMockReceiptReplay.create({
          data: {
            id: randomUUID(), requestId: input.receipt.requestId,
            issuedAt: input.receipt.issuedAt,
            signature: input.signatureHex.toLowerCase(),
            admissionId: input.admissionId,
          },
        });
        await tx.integrationProviderEvidence.create({
          data: {
            id: evidenceId, admissionId: input.admissionId,
            provider: 'MOCK', providerRequestId: input.receipt.requestId,
            confirmedOutcome: input.receipt.outcome,
            evidenceRef: input.evidenceRef + '/' +
              createHash('sha256').update(input.signatureHex.toLowerCase()).digest('hex').slice(0, 24),
            operatorId: input.operatorId, reviewerId: input.reviewerId,
            validated: true,
          },
        });
        return { accepted: true, evidenceId };
      });
    } catch {
      return { accepted: false, evidenceId: null };
    }
  }
}
