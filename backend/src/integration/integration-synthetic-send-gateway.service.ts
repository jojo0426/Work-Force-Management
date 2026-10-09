import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export type SyntheticSendResult =
  'SYNTHETIC_SENT' | 'STOPPED' | 'STALE_GENERATION' |
  'NOT_RESERVED' | 'ALREADY_ATTEMPTED' | 'INVALID' | 'UNKNOWN';

/**
 * Phase 5E.2AP: a PostgreSQL-serialized synthetic send boundary.
 *
 * A dedicated gateway would be the ONLY holder of provider credentials.
 * This prototype has no network transport and permits only isolated CI
 * synthetic callbacks. The callback runs while holding the GLOBAL row lock:
 * STOP cannot commit between the final epoch check and callback completion.
 *
 * The attempt is marked UNKNOWN durably BEFORE the callback. A process crash
 * can release the DB lock but cannot erase the unknown outcome. STOP may
 * acknowledge admission closure, NEVER external provider quiescence.
 */
@Injectable()
export class IntegrationSyntheticSendGatewayService {
  constructor(private readonly prisma: PrismaService) {}

  async dispatch(requestId: string, generation: bigint,
    syntheticSend: () => Promise<void>): Promise<SyntheticSendResult> {
    if (process.env.GITHUB_ACTIONS !== 'true' ||
        process.env.WFM_SYNTHETIC_SEND_GATEWAY_FIXTURE !== 'true' ||
        !new RegExp('[/]wfm_ci(?:[?]|$)').test(process.env.DATABASE_URL || '') ||
        !/^[A-Za-z0-9_-]{16,100}$/.test(requestId) ||
        typeof generation !== 'bigint' || generation < 0n ||
        typeof syntheticSend !== 'function') return 'INVALID';
    try {
      // Durable may-have-sent marker. No callback may run before this commit.
      const marked = await this.prisma.$transaction(async tx => {
        const attempt = await tx.integrationSharedGatewayAttempt.findUnique({
          where: { requestId },
        });
        if (!attempt || attempt.generation !== generation) return false;
        const updated = await tx.integrationSharedGatewayAttempt.updateMany({
          where: { requestId, generation, status: 'RESERVED' },
          data: { status: 'UNKNOWN' },
        });
        return updated.count === 1;
      });
      if (!marked) return 'ALREADY_ATTEMPTED';
      return await this.prisma.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ stopped: boolean; generation: bigint }>>`
          SELECT "stopped", "generation" FROM "IntegrationSharedGatewayControl"
          WHERE "id" = 'GLOBAL' FOR UPDATE
        `;
        if (rows.length !== 1 || rows[0].stopped) return 'STOPPED';
        if (rows[0].generation !== generation) return 'STALE_GENERATION';
        // Synthetic-only callback: no provider egress, no detached tasks.
        await syntheticSend();
        // Deliberately retain UNKNOWN; provider confirmation is independent.
        return 'SYNTHETIC_SENT';
      }, { timeout: 20000, maxWait: 10000 });
    } catch { return 'UNKNOWN'; }
  }
}
