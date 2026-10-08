import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';

export type FleetGateSnapshot = Readonly<{
  allowed: boolean;
  generation: bigint | null;
  reason: 'ENABLED' | 'DISABLED' | 'MISSING' | 'UNAVAILABLE';
}>;

/**
 * Phase 5E.2B control-plane prototype.
 * Admission and stop serialize on the same PostgreSQL singleton row lock.
 * An admitted request can remain in flight after stop acknowledgement;
 * this does not authorize automatic replay or production activation.
 */
@Injectable()
export class IntegrationFleetControlService {
  constructor(private readonly prisma: PrismaService) {}

  async inspectGate(): Promise<FleetGateSnapshot> {
    try {
      const row = await this.prisma.integrationFleetControl.findUnique({
        where: { id: 'GLOBAL' },
        select: { enabled: true, generation: true },
      });
      if (!row) return { allowed: false, generation: null, reason: 'MISSING' };
      return {
        allowed: row.enabled === true,
        generation: row.generation,
        reason: row.enabled === true ? 'ENABLED' : 'DISABLED',
      };
    } catch {
      return { allowed: false, generation: null, reason: 'UNAVAILABLE' };
    }
  }

  /** No remote enable path is provided. Never creates the control row. */
  async stopFleet(actor: string, reasonCode: string): Promise<{ stopped: boolean; generation: bigint | null }> {
    const safeActor = String(actor || '').trim();
    const safeReason = String(reasonCode || '').trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(safeActor) || !/^[A-Z0-9_]{1,80}$/.test(safeReason)) {
      throw new Error('A safe operator identifier and reason code are required');
    }
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ id: string; generation: bigint }>>`
        SELECT "id", "generation" FROM "IntegrationFleetControl"
        WHERE "id" = 'GLOBAL' FOR UPDATE
      `;
      if (rows.length !== 1) return { stopped: false, generation: null };
      const updated = await tx.integrationFleetControl.update({
        where: { id: 'GLOBAL' },
        data: {
          enabled: false,
          generation: { increment: 1 },
          stoppedAt: new Date(),
          stoppedBy: safeActor,
          reasonCode: safeReason,
        },
      });
      return { stopped: true, generation: updated.generation };
    });
  }

  /**
   * Experimental bounded dispatch fence. The singleton row lock remains held
   * until the callback settles, so stopFleet cannot acknowledge while the
   * callback is starting/running. Never use for real providers before
   * uncertain-outcome reconciliation and timeout/drain acceptance.
   */
  async withFencedDispatch<T>(
    jobId: string,
    claimToken: string,
    callback: () => Promise<T>,
  ): Promise<{ admitted: boolean; result?: T }> {
    if (!jobId || !claimToken) return { admitted: false };
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ enabled: boolean; generation: bigint }>>`
        SELECT "enabled", "generation" FROM "IntegrationFleetControl"
        WHERE "id" = 'GLOBAL' FOR UPDATE
      `;
      if (rows.length !== 1 || rows[0].enabled !== true) return { admitted: false };
      const job = await tx.integrationJob.findFirst({
        where: { id: jobId, claimToken, status: 'PROCESSING' },
        select: { id: true },
      });
      if (!job) return { admitted: false };
      const admissionId = randomUUID();
      await tx.integrationAdmission.create({
        data: { id: admissionId, jobId, claimToken, generation: rows[0].generation, status: 'ADMITTED' },
      });
      // This awaits the full adapter operation while retaining the row lock.
      // Timeout/connection loss can still leave external effects ambiguous.
      const result = await callback();
      await tx.integrationAdmission.update({
        where: { id: admissionId },
        data: { status: 'SETTLED', releasedAt: new Date() },
      });
      return { admitted: true, result };
    }, { maxWait: 5_000, timeout: 30_000 });
  }

  /**
   * Reserves an admission before dispatch, with a row lock shared with stop.
   * This reservation is NOT sufficient by itself to guarantee the request
   * starts before stop acknowledgement: a worker may pause after commit.
   */
  async reserveAdmission(jobId: string, claimToken: string): Promise<{ admitted: boolean; admissionId: string | null }> {
    if (!jobId || !claimToken) return { admitted: false, admissionId: null };
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ enabled: boolean; generation: bigint }>>`
          SELECT "enabled", "generation" FROM "IntegrationFleetControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || rows[0].enabled !== true) return { admitted: false, admissionId: null };
        const job = await tx.integrationJob.findFirst({
          where: { id: jobId, claimToken, status: 'PROCESSING' },
          select: { id: true },
        });
        if (!job) return { admitted: false, admissionId: null };
        const admissionId = randomUUID();
        await tx.integrationAdmission.create({
          data: { id: admissionId, jobId, claimToken, generation: rows[0].generation, status: 'ADMITTED' },
        });
        return { admitted: true, admissionId };
      });
    } catch {
      return { admitted: false, admissionId: null };
    }
  }
}
