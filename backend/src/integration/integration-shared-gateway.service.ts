import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export type SharedGatewayAdmission =
  'RESERVED' | 'STOPPED' | 'STALE_GENERATION' | 'DUPLICATE' | 'INVALID';

/**
 * Phase 5E.2AO shared durable *admission* gate, not an external send gate.
 * All mutations serialize through the GLOBAL row FOR UPDATE across replicas.
 * Delayed authorized senders remain unsafe until an independent provider fence.
 * This service performs no provider I/O and never claims external quiescence.
 */
@Injectable()
export class IntegrationSharedGatewayService {
  constructor(private readonly prisma: PrismaService) {}

  async reserve(requestId: string, generation: bigint): Promise<SharedGatewayAdmission> {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId) ||
        typeof generation !== 'bigint' || generation < 0n) return 'INVALID';
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ stopped: boolean; generation: bigint }>>`
          SELECT "stopped", "generation" FROM "IntegrationSharedGatewayControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || rows[0].stopped) return 'STOPPED';
        if (rows[0].generation !== generation) return 'STALE_GENERATION';
        const prior = await tx.integrationSharedGatewayAttempt.findUnique({
          where: { requestId }, select: { requestId: true },
        });
        if (prior) return 'DUPLICATE';
        await tx.integrationSharedGatewayAttempt.create({
          data: { requestId, generation, status: 'RESERVED' },
        });
        return 'RESERVED';
      });
    } catch { return 'INVALID'; }
  }

  async stop(nextGeneration: bigint): Promise<{
    admissionsClosed: boolean; generation: bigint | null;
    unresolvedAttempts: number | null; externallyQuiescent: false;
  }> {
    if (typeof nextGeneration !== 'bigint' || nextGeneration < 1n)
      return { admissionsClosed: false, generation: null,
        unresolvedAttempts: null, externallyQuiescent: false };
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ generation: bigint }>>`
          SELECT "generation" FROM "IntegrationSharedGatewayControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || nextGeneration <= rows[0].generation)
          return { admissionsClosed: false, generation: null,
            unresolvedAttempts: null, externallyQuiescent: false as const };
        await tx.integrationSharedGatewayControl.update({
          where: { id: 'GLOBAL' }, data: { stopped: true, generation: nextGeneration },
        });
        const unresolvedAttempts = await tx.integrationSharedGatewayAttempt.count({
          where: { status: { in: ['RESERVED', 'UNKNOWN'] } },
        });
        return { admissionsClosed: true, generation: nextGeneration,
          unresolvedAttempts, externallyQuiescent: false as const };
      });
    } catch {
      return { admissionsClosed: false, generation: null,
        unresolvedAttempts: null, externallyQuiescent: false };
    }
  }

  /** Only test fixture setup. No public enable endpoint or production rearm. */
  async fixtureRearm(generation: bigint): Promise<boolean> {
    if (process.env.GITHUB_ACTIONS !== 'true' ||
        process.env.WFM_SHARED_GATEWAY_FIXTURE !== 'true' ||
        !new RegExp('[/]wfm_ci(?:[?]|$)').test(process.env.DATABASE_URL || '') ||
        typeof generation !== 'bigint' || generation < 0n) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ generation: bigint }>>`
          SELECT "generation" FROM "IntegrationSharedGatewayControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || generation <= rows[0].generation) return false;
        const unresolved = await tx.integrationSharedGatewayAttempt.count({
          where: { status: { in: ['RESERVED', 'UNKNOWN'] } },
        });
        if (unresolved !== 0) return false;
        await tx.integrationSharedGatewayControl.update({
          where: { id: 'GLOBAL' }, data: { generation, stopped: false },
        });
        return true;
      });
    } catch { return false; }
  }

  /** Crash recovery never guesses that an attempt did not reach the provider. */
  async markUnknown(requestId: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) return false;
    try {
      const changed = await this.prisma.integrationSharedGatewayAttempt.updateMany({
        where: { requestId, status: 'RESERVED' },
        data: { status: 'UNKNOWN' },
      });
      return changed.count === 1;
    } catch { return false; }
  }

  async inspect(): Promise<{
    stopped: boolean; generation: bigint; unresolvedAttempts: number;
    externallyQuiescent: false;
  } | null> {
    try {
      const [control, unresolvedAttempts] = await Promise.all([
        this.prisma.integrationSharedGatewayControl.findUnique({ where: { id: 'GLOBAL' } }),
        this.prisma.integrationSharedGatewayAttempt.count({
          where: { status: { in: ['RESERVED', 'UNKNOWN'] } },
        }),
      ]);
      if (!control) return null;
      return { stopped: control.stopped, generation: control.generation,
        unresolvedAttempts, externallyQuiescent: false };
    } catch { return null; }
  }
}
