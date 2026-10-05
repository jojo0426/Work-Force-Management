import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';

// Future API Architecture — prepare WFM for multiple API integrations.
// Phase 5A keeps external execution disabled: this service owns durable queue state only.
@Injectable()
export class IntegrationService {
  constructor(private prisma: PrismaService) {}

  async queueIntegrationJob(
    source: string,
    target: string | null,
    payload: any,
    idempotencyKey?: string | null,
    maxRetries = 5,
  ) {
    const sourceSystem = String(source || '').trim();
    const targetSystem = target == null ? null : String(target).trim() || null;
    const normalizedKey = idempotencyKey == null ? null : String(idempotencyKey).trim() || null;
    const retryLimit = Number.isInteger(maxRetries) && maxRetries >= 0 ? maxRetries : 5;

    if (!sourceSystem) throw new Error('sourceSystem is required');

    if (normalizedKey) {
      const existing = await this.prisma.integrationJob.findUnique({
        where: {
          sourceSystem_idempotencyKey: {
            sourceSystem,
            idempotencyKey: normalizedKey,
          },
        },
      });
      if (existing) return { job: existing, idempotent: true };
    }

    try {
      const job = await this.prisma.integrationJob.create({
        data: {
          sourceSystem,
          targetSystem,
          payload,
          status: 'PENDING',
          idempotencyKey: normalizedKey,
          maxRetries: retryLimit,
          nextAttemptAt: new Date(),
        } as any,
      });
      return { job, idempotent: false };
    } catch (error: any) {
      if (normalizedKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const winner = await this.prisma.integrationJob.findUnique({
          where: {
            sourceSystem_idempotencyKey: {
              sourceSystem,
              idempotencyKey: normalizedKey,
            },
          },
        });
        if (winner) return { job: winner, idempotent: true };
      }
      throw error;
    }
  }

  async claimNextJob(now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      // A competing worker can win the first candidate between discovery and
      // updateMany. Keep scanning so this worker can claim another eligible job
      // instead of reporting IDLE while runnable work remains.
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const candidate = await tx.integrationJob.findFirst({
          where: { status: 'PENDING', nextAttemptAt: { lte: now } },
          orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
        });
        if (!candidate) return null;

        const claimToken = randomUUID();
        const claimed = await tx.integrationJob.updateMany({
          where: {
            id: candidate.id,
            status: 'PENDING',
            nextAttemptAt: { lte: now },
            claimToken: null,
          },
          data: {
            status: 'PROCESSING',
            claimToken,
            claimedAt: now,
            lastAttemptAt: now,
          },
        });
        if (claimed.count !== 1) continue;

        return tx.integrationJob.findUnique({ where: { id: candidate.id } });
      }

      return null;
    });
  }

  async completeClaimedJob(jobId: string, claimToken: string, completedAt = new Date()) {
    const claimed = await this.prisma.integrationJob.updateMany({
      where: { id: jobId, status: 'PROCESSING', claimToken },
      data: {
        status: 'COMPLETED',
        completedAt,
        processedAt: completedAt,
        claimToken: null,
        claimedAt: null,
        lastError: null,
      },
    });
    if (claimed.count !== 1) throw new Error('Integration job claim is no longer owned by this token');
    return this.prisma.integrationJob.findUnique({ where: { id: jobId } });
  }

  async failClaimedJob(
    jobId: string,
    claimToken: string,
    error: unknown,
    retryDelayMs = 30_000,
    now = new Date(),
  ) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.integrationJob.findFirst({
        where: { id: jobId, status: 'PROCESSING', claimToken },
      });
      if (!current) throw new Error('Integration job claim is no longer owned by this token');

      const retries = current.retries + 1;
      const exhausted = retries >= current.maxRetries;
      const lastError = String((error as any)?.message ?? error ?? 'Unknown integration error').slice(0, 4000);
      const failedAt = exhausted ? now : null;
      const nextAttemptAt = exhausted ? current.nextAttemptAt : new Date(now.getTime() + Math.max(0, retryDelayMs));

      const updated = await tx.integrationJob.updateMany({
        where: { id: jobId, status: 'PROCESSING', claimToken, retries: current.retries },
        data: {
          status: exhausted ? 'FAILED' : 'PENDING',
          retries,
          nextAttemptAt,
          lastError,
          failedAt,
          claimToken: null,
          claimedAt: null,
        },
      });
      if (updated.count !== 1) throw new Error('Integration job claim changed before failure transition');
      return tx.integrationJob.findUnique({ where: { id: jobId } });
    });
  }

  async processPendingJobs() {
    const now = new Date();
    const pending = await this.prisma.integrationJob.findMany({
      where: { status: 'PENDING', nextAttemptAt: { lte: now } },
      orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
      take: 10,
    });
    // Discovery only. Phase 5A does not execute external integrations.
    return { pending: pending.length, jobs: pending, externalActionsExecuted: false };
  }

  async getIntegrationArchitecture() {
    return {
      architecture: 'Technician App + Web Portal -> WFM API -> Integration Layer -> API1, API2, API3, API4, Future API',
      benefits: 'Flexibility to connect other FiberBlaze/Meridian systems later without rebuilding technician app',
      preparedApis: [
        { name: 'API 1', description: 'Billing / Subscriber System (future)', status: 'PREPARED' },
        { name: 'API 2', description: 'Network Inventory / NAP Management (future)', status: 'PREPARED' },
        { name: 'API 3', description: 'CRM / Customer Management (future)', status: 'PREPARED' },
        { name: 'API 4', description: 'Notification / SMS Gateway (future)', status: 'PREPARED' },
        { name: 'Future API', description: 'Digital signatures, analytics, route optimization (Phase 4)', status: 'PLANNED' },
      ],
      currentIntegration: 'WFM API acts as central gateway — technician app never talks directly to external systems',
      externalExecutionEnabled: false,
    };
  }
}
