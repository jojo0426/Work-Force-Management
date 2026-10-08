import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export type FleetGateSnapshot = Readonly<{
  allowed: boolean;
  generation: bigint | null;
  reason: 'ENABLED' | 'DISABLED' | 'MISSING' | 'UNAVAILABLE';
}>;

/**
 * Phase 5E.2 foundation: read-only shared policy gate.
 * IMPORTANT: A read-only gate is NOT an admission fence. Never use this
 * snapshot alone to authorize provider execution; concurrent stop can race it.
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
}
