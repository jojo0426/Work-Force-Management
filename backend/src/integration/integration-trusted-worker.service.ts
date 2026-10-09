import { createHash, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

function fingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}
function safeMatch(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actual, 'hex'));
}
/**
 * Isolated control-plane prototype: caller MUST be a trusted deployment
 * controller. No HTTP routes and no runtime worker dispatch integration.
 * A credential is never stored directly by this new service.
 */
@Injectable()
export class IntegrationTrustedWorkerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Deprecated unaudited roster mutation: permanently fail closed. */
  async enroll(_workerId: string, _secret: string, _approvedBy: string): Promise<boolean> {
    return false;
  }

  async register(workerId: string, secret: string, generation: bigint): Promise<boolean> {
    if (!workerId || secret.length < 32 || generation < 0n) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ enabled: boolean; generation: bigint }>>`
          SELECT "enabled", "generation" FROM "IntegrationFleetControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || rows[0].generation !== generation) return false;
        const approved = await tx.integrationExpectedWorker.findUnique({ where: { workerId } });
        if (!approved || approved.retiredAt ||
            !safeMatch(approved.credentialHash, fingerprint(secret))) return false;
        const existing = await tx.integrationWorkerMembership.findUnique({ where: { workerId } });
        if (existing) return false; // restart requires controlled identity rotation
        await tx.integrationWorkerMembership.create({
          data: { workerId, instanceToken: fingerprint(secret), generation },
        });
        return true;
      });
    } catch { return false; }
  }

  async acknowledgeStop(workerId: string, secret: string, generation: bigint): Promise<boolean> {
    if (!workerId || secret.length < 32 || generation < 0n) return false;
    try {
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ enabled: boolean; generation: bigint }>>`
          SELECT "enabled", "generation" FROM "IntegrationFleetControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || rows[0].enabled || rows[0].generation !== generation) return false;
        const approved = await tx.integrationExpectedWorker.findUnique({ where: { workerId } });
        if (!approved || approved.retiredAt ||
            !safeMatch(approved.credentialHash, fingerprint(secret))) return false;
        const changed = await tx.integrationWorkerMembership.updateMany({
          where: { workerId, instanceToken: approved.credentialHash,
            generation: { lt: generation }, stopAckGeneration: null },
          data: { stopAckGeneration: generation, stopAckAt: new Date(), lastSeenAt: new Date() },
        });
        return changed.count === 1;
      });
    } catch { return false; }
  }

  /**
   * Retire only after fleet stop and a clean durable admission ledger.
   * Retirement never deletes historical membership or claims external drain.
   * A separate operator approval workflow is still required before production.
   */
  /** Deprecated unaudited roster mutation: permanently fail closed. */
  async retire(_workerId: string, _approvedBy: string): Promise<boolean> {
    return false;
  }

  /** Derive expected workers from the database, never a caller-provided subset. */
  async inspect(): Promise<{
    admissionsClosed: boolean; allAcknowledged: boolean;
    ledgerEmpty: boolean; externallyQuiescent: false; reason: string;
  }> {
    const unknown = { admissionsClosed: false, allAcknowledged: false,
      ledgerEmpty: false, externallyQuiescent: false as const, reason: 'UNAVAILABLE' };
    try {
      return await this.prisma.$transaction(async tx => {
        const fleet = await tx.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' } });
        if (!fleet || fleet.enabled) return { ...unknown, reason: 'NOT_STOPPED' };
        const expected = await tx.integrationExpectedWorker.findMany({ where: { retiredAt: null } });
        if (!expected.length) return { ...unknown, reason: 'EMPTY_ROSTER' };
        const members = await tx.integrationWorkerMembership.findMany({
          where: { workerId: { in: expected.map(x => x.workerId) } },
        });
        const unresolved = await tx.integrationAdmission.count({
          where: { status: { in: ['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN'] } },
        });
        const allAcknowledged = members.length === expected.length &&
          members.every(m => m.stopAckGeneration === fleet.generation && m.activeAttempts === 0);
        return { admissionsClosed: true, allAcknowledged,
          ledgerEmpty: unresolved === 0, externallyQuiescent: false as const,
          reason: !allAcknowledged ? 'WORKERS_UNCONFIRMED' :
            unresolved > 0 ? 'UNRESOLVED_ATTEMPTS' : 'LOCAL_ONLY_NOT_PROVIDER_PROOF' };
      });
    } catch { return unknown; }
  }
}
