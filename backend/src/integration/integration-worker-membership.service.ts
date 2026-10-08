import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Control-plane prototype. Requires a trusted deployment controller to issue
 * unguessable instance tokens and an authenticated worker transport.
 * No public routes; not wired into live dispatch.
 */
@Injectable()
export class IntegrationWorkerMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async register(workerId: string, instanceToken: string, generation: bigint): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(workerId) ||
        instanceToken.length < 32 || !/^[A-Za-z0-9_-]+$/.test(instanceToken) ||
        generation < 0n) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ enabled: boolean; generation: bigint }>>`
          SELECT "enabled", "generation" FROM "IntegrationFleetControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || rows[0].generation !== generation) return false;
        // No upsert: an existing worker identity must not be silently
        // overwritten by a restarted process without controller approval.
        const existing = await tx.integrationWorkerMembership.findUnique({
          where: { workerId }, select: { workerId: true },
        });
        if (existing) return false;
        await tx.integrationWorkerMembership.create({
          data: { workerId, instanceToken, generation },
        });
        return true;
      });
    } catch { return false; }
  }

  async acknowledgeStop(workerId: string, instanceToken: string, generation: bigint): Promise<boolean> {
    if (!workerId || !instanceToken || generation < 0n) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ enabled: boolean; generation: bigint }>>`
          SELECT "enabled", "generation" FROM "IntegrationFleetControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || rows[0].enabled || rows[0].generation !== generation) return false;
        const updated = await tx.integrationWorkerMembership.updateMany({
          where: { workerId, instanceToken, stopAckGeneration: null,
            generation: { lt: generation } },
          data: { stopAckGeneration: generation, stopAckAt: new Date(), lastSeenAt: new Date() },
        });
        return updated.count === 1;
      });
    } catch { return false; }
  }

  async inspectStoppedFleet(expectedWorkerIds: readonly string[]): Promise<{
    admissionsClosed: boolean;
    allAcknowledged: boolean;
    ledgerEmpty: boolean;
    externallyQuiescent: false;
    reason: string;
  }> {
    const unknown = { admissionsClosed: false, allAcknowledged: false,
      ledgerEmpty: false, externallyQuiescent: false as const, reason: 'UNAVAILABLE' };
    if (!expectedWorkerIds.length || new Set(expectedWorkerIds).size !== expectedWorkerIds.length) {
      return { ...unknown, reason: 'INVALID_ROSTER' };
    }
    try {
      return await this.prisma.$transaction(async tx => {
        const control = await tx.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
        if (!control || control.enabled) return { ...unknown, reason: 'NOT_STOPPED' };
        const members = await tx.integrationWorkerMembership.findMany({
          where: { workerId: { in: [...expectedWorkerIds] } },
        });
        const unresolved = await tx.integrationAdmission.count({
          where: { status: { in: ['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN'] } },
        });
        const acknowledged = members.length === expectedWorkerIds.length &&
          members.every(m => m.stopAckGeneration === control.generation && m.activeAttempts === 0);
        return {
          admissionsClosed: true, allAcknowledged: acknowledged,
          ledgerEmpty: unresolved === 0, externallyQuiescent: false as const,
          reason: !acknowledged ? 'WORKERS_UNCONFIRMED' :
            unresolved > 0 ? 'UNRESOLVED_ATTEMPTS' : 'LOCAL_ONLY_NOT_PROVIDER_PROOF',
        };
      });
    } catch { return unknown; }
  }
}
