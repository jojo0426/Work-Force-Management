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

  /** Legacy untrusted registration and acknowledgment paths disabled.
   * Only IntegrationTrustedWorkerService may issue new membership records.
   */
  async register(_workerId: string, _instanceToken: string, _generation: bigint): Promise<boolean> {
    return false;
  }

  async acknowledgeStop(_workerId: string, _instanceToken: string, _generation: bigint): Promise<boolean> {
    return false;
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
