import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IntegrationApprovalLedgerService } from './integration-approval-ledger.service';

type ApprovalRequest = Readonly<{
  admissionId: string;
  evidenceId: string;
}>;

/**
 * Phase 5E.2T: the actor is derived exclusively from verified JWT middleware.
 * This endpoint records approvals; it cannot resolve admissions or call providers.
 */
@Controller('integration/reconciliation-approval')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationApprovalController {
  constructor(private readonly approvals: IntegrationApprovalLedgerService) {}

  @Post('propose')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async propose(@Req() req: any, @Body() body: ApprovalRequest) {
    return { recorded: await this.record(req, body, 'PROPOSE') };
  }

  @Post('approve')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async approve(@Req() req: any, @Body() body: ApprovalRequest) {
    return { recorded: await this.record(req, body, 'APPROVE') };
  }

  private async record(
    req: any, body: ApprovalRequest, action: 'PROPOSE' | 'APPROVE',
  ): Promise<boolean> {
    if (!req?.user?.id || !req?.authSessionHash ||
        !body || typeof body.admissionId !== 'string' ||
        typeof body.evidenceId !== 'string') return false;
    return this.approvals.record({
      userId: req.user.id,
      role: req.user.role,
      sessionHash: req.authSessionHash,
    }, body.admissionId, body.evidenceId, action);
  }
}
