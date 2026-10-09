import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { IntegrationLegacyCredentialInventoryService } from './integration-legacy-credential-inventory.service';

const UNRESOLVED = ['ADMITTED', 'MAY_HAVE_DISPATCHED', 'IN_FLIGHT', 'UNCERTAIN'] as const;

/** Advisory read-only preflight. Never authorizes or executes credential rotation. */
@Injectable()
export class IntegrationCredentialRotationReadinessService {
  constructor(private readonly prisma: PrismaService,
    private readonly inventory: IntegrationLegacyCredentialInventoryService) {}

  async inspect(): Promise<{
    fleetStopped: boolean; unresolvedAdmissions: number;
    activeAttempts: number; unmatchedOrLegacy: number;
    unapprovedMemberships: number; safeToRotate: false;
    externallyQuiescent: false;
  } | null> {
    try {
      const [fleet, unresolvedAdmissions, attemptStats, inventory] = await Promise.all([
        this.prisma.integrationFleetControl.findUnique({ where: { id: 'GLOBAL' },
          select: { enabled: true } }),
        this.prisma.integrationAdmission.count({ where: { status: { in: [...UNRESOLVED] } } }),
        this.prisma.integrationWorkerMembership.aggregate({ _sum: { activeAttempts: true } }),
        this.inventory.assess(),
      ]);
      if (!fleet || !inventory) return null;
      return {
        fleetStopped: !fleet.enabled, unresolvedAdmissions,
        activeAttempts: attemptStats._sum.activeAttempts || 0,
        unmatchedOrLegacy: inventory.unmatchedOrLegacy,
        unapprovedMemberships: inventory.unapprovedMemberships,
        safeToRotate: false, externallyQuiescent: false,
      };
    } catch { return null; }
  }
}
