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
   * Phase 5E.2G: commit a durable MAY_HAVE_DISPATCHED marker BEFORE any adapter
   * invocation. Then acquire a second row lock for the actual callback.
   * Failure of either transaction never erases the committed marker.
   *
   * Still experimental: a lost DB connection/timeout may release the row lock
   * while an external provider operation remains active.
   */
  async withFencedDispatch<T>(
    jobId: string,
    claimToken: string,
    callback: () => Promise<T>,
  ): Promise<{ admitted: boolean; result?: T }> {
    if (!jobId || !claimToken) return { admitted: false };
    const admissionId = randomUUID();
    const prepared = await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ enabled: boolean; generation: bigint }>>`
        SELECT "enabled", "generation" FROM "IntegrationFleetControl"
        WHERE "id" = 'GLOBAL' FOR UPDATE
      `;
      if (rows.length !== 1 || rows[0].enabled !== true) return false;
      const job = await tx.integrationJob.findFirst({
        where: { id: jobId, claimToken, status: 'PROCESSING' },
        select: { id: true },
      });
      if (!job) return false;
      await tx.integrationAdmission.create({
        data: {
          id: admissionId, jobId, claimToken, generation: rows[0].generation,
          status: 'MAY_HAVE_DISPATCHED',
        },
      });
      return true;
    }, { maxWait: 5_000, timeout: 10_000 });
    if (!prepared) return { admitted: false };

    // The marker is committed. Even if stop wins this second lock, keep the
    // marker for conservative manual reconciliation rather than auto-retry.
    return this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ enabled: boolean; generation: bigint }>>`
        SELECT "enabled", "generation" FROM "IntegrationFleetControl"
        WHERE "id" = 'GLOBAL' FOR UPDATE
      `;
      const marker = await tx.integrationAdmission.findUnique({
        where: { id: admissionId },
        select: { generation: true },
      });
      if (rows.length !== 1 || rows[0].enabled !== true ||
          !marker || marker.generation !== rows[0].generation) {
        return { admitted: false };
      }
      const job = await tx.integrationJob.findFirst({
        where: { id: jobId, claimToken, status: 'PROCESSING' },
        select: { id: true },
      });
      if (!job) return { admitted: false };
      const result = await callback();
      // Do not erase the committed marker on rollback/timeout.
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
