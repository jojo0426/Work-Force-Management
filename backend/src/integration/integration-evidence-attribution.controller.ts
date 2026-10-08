import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { IntegrationEvidenceAttributionService } from './integration-evidence-attribution.service';

@Controller('integration/evidence-attribution')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationEvidenceAttributionController {
  constructor(private readonly attribution: IntegrationEvidenceAttributionService) {}

  @Post('attest')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async attest(@Req() request: any, @Body() body: { evidenceId: string }) {
    return { recorded: await this.record(request, body, 'ATTEST') };
  }

  @Post('review')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async review(@Req() request: any, @Body() body: { evidenceId: string }) {
    return { recorded: await this.record(request, body, 'REVIEW') };
  }

  private record(
    request: any, body: { evidenceId: string }, action: 'ATTEST' | 'REVIEW',
  ): Promise<boolean> {
    if (!request?.user?.id || !request.authSessionHash ||
        !body || typeof body.evidenceId !== 'string') return Promise.resolve(false);
    return this.attribution.record({
      userId: request.user.id,
      role: request.user.role,
      sessionHash: request.authSessionHash,
    }, body.evidenceId, action);
  }
}
