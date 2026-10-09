import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Read-only, aggregate-only legacy credential inventory. No token values,
 * worker IDs, credential hashes, or secrets returned or logged.
 */
@Injectable()
export class IntegrationLegacyCredentialInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async assess(): Promise<{
    total: number; matchesApprovedFingerprint: number;
    unmatchedOrLegacy: number; unapprovedMemberships: number;
    migrationAuthorized: false; externallyQuiescent: false;
  } | null> {
    try {
      const [members, approved] = await Promise.all([
        this.prisma.integrationWorkerMembership.findMany({
          select: { workerId: true, instanceToken: true },
        }),
        this.prisma.integrationExpectedWorker.findMany({
          select: { workerId: true, credentialHash: true, retiredAt: true },
        }),
      ]);
      const roster = new Map(approved.filter(a => a.retiredAt === null)
        .map(a => [a.workerId, a.credentialHash]));
      let matched = 0, unknown = 0;
      for (const member of members) {
        const expected = roster.get(member.workerId);
        if (!expected) unknown++;
        if (expected && /^[a-f0-9]{64}$/.test(member.instanceToken) &&
            member.instanceToken === expected) matched++;
      }
      return {
        total: members.length, matchesApprovedFingerprint: matched,
        unmatchedOrLegacy: members.length - matched,
        unapprovedMemberships: unknown,
        migrationAuthorized: false, externallyQuiescent: false,
      };
    } catch { return null; }
  }
}
