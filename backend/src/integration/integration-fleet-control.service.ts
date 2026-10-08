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

  /**
   * Read-only, fail-closed shutdown status. A stopped gate is NOT equivalent
   * to drained: unresolved attempts can outlive a worker or DB connection.
   */
  async inspectDrain(): Promise<{
    stopped: boolean;
    drained: boolean;
    generation: bigint | null;
    unresolved: number | null;
    reason: 'STOPPED' | 'ENABLED' | 'MISSING' | 'UNAVAILABLE';
  }> {
    try {
      return await this.prisma.$transaction(async tx => {
        const row = await tx.integrationFleetControl.findUnique({
          where: { id: 'GLOBAL' }, select: { enabled: true, generation: true },
        });
        if (!row) return { stopped: false, drained: false, generation: null, unresolved: null, reason: 'MISSING' as const };
        const unresolved = await tx.integrationAdmission.count({
          where: { status: { in: ['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN'] } },
        });
        return {
          stopped: row.enabled === false,
          drained: row.enabled === false && unresolved === 0,
          generation: row.generation,
          unresolved,
          reason: row.enabled === false ? 'STOPPED' as const : 'ENABLED' as const,
        };
      });
    } catch {
      return { stopped: false, drained: false, generation: null, unresolved: null, reason: 'UNAVAILABLE' };
    }
  }

  /**
   * Conservative operator-only terminal resolution of a durable attempt.
   * Caller must independently verify provider outcome and authorization.
   * No API endpoint is exposed by this service.
   */
  async markAdmissionReconciled(admissionId: string): Promise<boolean> {
    if (!admissionId) return false;
    const updated = await this.prisma.integrationAdmission.updateMany({
      where: {
        id: admissionId,
        status: { in: ['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN'] },
      },
      data: { status: 'RECONCILED', releasedAt: new Date() },
    });
    return updated.count === 1;
  }

  /**
   * Conservative durable lifecycle transition for a previously committed
   * attempt. Only a matching owner may mark its dispatch boundary.
   * No provider call is authorized by this method alone.
   */
  async markAttemptInFlight(admissionId: string, jobId: string, claimToken: string): Promise<boolean> {
    if (!admissionId || !jobId || !claimToken) return false;
    try {
      return await this.prisma.$transaction(async tx => {
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
        const changed = await tx.integrationAdmission.updateMany({
          where: {
            id: admissionId, jobId, claimToken,
            generation: rows[0].generation, status: 'MAY_HAVE_DISPATCHED',
          },
          data: { status: 'IN_FLIGHT' },
        });
        return changed.count === 1;
      });
    } catch {
      return false;
    }
  }

  /** Conservative, durable uncertain-outcome transition; never auto-retry. */
  async markAttemptUncertain(admissionId: string, jobId: string, claimToken: string): Promise<boolean> {
    if (!admissionId || !jobId || !claimToken) return false;
    try {
      const changed = await this.prisma.integrationAdmission.updateMany({
        where: {
          id: admissionId, jobId, claimToken,
          status: { in: ['MAY_HAVE_DISPATCHED', 'IN_FLIGHT'] },
        },
        data: { status: 'UNCERTAIN' },
      });
      return changed.count === 1;
    } catch {
      return false;
    }
  }

  /**
   * Strict dispatch-start authorization is deliberately NOT claimed here:
   * a database commit cannot atomically authorize an external network send.
   * Return a conservative status for operator-facing stop decisions.
   */
  async inspectStopSafety(): Promise<{
    admissionsClosed: boolean;
    externalQuiescenceVerified: false;
    unresolvedAttempts: number | null;
    reason: 'STOPPED_WITH_UNCERTAINTY' | 'STOPPED_LEDGER_EMPTY' | 'ENABLED' | 'UNAVAILABLE';
  }> {
    const state = await this.inspectDrain();
    if (!state.stopped) {
      return {
        admissionsClosed: false, externalQuiescenceVerified: false,
        unresolvedAttempts: state.unresolved,
        reason: state.reason === 'ENABLED' ? 'ENABLED' : 'UNAVAILABLE',
      };
    }
    return {
      admissionsClosed: true, externalQuiescenceVerified: false,
      unresolvedAttempts: state.unresolved,
      reason: state.unresolved === 0 ? 'STOPPED_LEDGER_EMPTY' : 'STOPPED_WITH_UNCERTAINTY',
    };
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
   * Phase 5E.2K: never hold a database transaction during adapter execution.
   * A committed MAY_HAVE_DISPATCHED marker precedes the callback; uncertainty
   * is retained on failure. Stop closes new admissions, but cannot prove an
   * already admitted external request has ended.
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

    // A second short transaction rechecks stop/generation and records the
    // in-flight boundary. A stop after this commit can acknowledge while
    // the callback remains active; unresolved ledger entries remain visible.
    const started = await this.markAttemptInFlight(admissionId, jobId, claimToken);
    if (!started) return { admitted: false };

    try {
      const result = await callback();
      return { admitted: true, result };
    } catch (error) {
      // Best effort only: if persistence fails, the committed IN_FLIGHT
      // record still blocks an optimistic drain result.
      await this.markAttemptUncertain(admissionId, jobId, claimToken);
      throw error;
    }
  }

  /**
   * A successful worker completion can settle the committed attempt only
   * after its claim has completed. Failure/timeout leaves it unresolved.
   */
  async settleCompletedClaim(jobId: string, claimToken: string): Promise<number> {
    const completed = await this.prisma.integrationJob.findUnique({
      where: { id: jobId }, select: { status: true, claimToken: true },
    });
    if (!completed || completed.status !== 'COMPLETED' || completed.claimToken !== null) return 0;
    const settled = await this.prisma.integrationAdmission.updateMany({
      where: { jobId, claimToken, status: { in: ['MAY_HAVE_DISPATCHED', 'IN_FLIGHT'] } },
      data: { status: 'SETTLED', releasedAt: new Date() },
    });
    return settled.count;
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
