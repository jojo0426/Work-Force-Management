import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IntegrationService } from './integration.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('integration')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IntegrationController {
  constructor(private integration: IntegrationService) {}

  @Get('architecture')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async architecture() {
    return this.integration.getIntegrationArchitecture();
  }

  @Post('queue')
  @Roles(UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async queue(@Body() body: { source: string, target: string, payload: any }) {
    return this.integration.queueIntegrationJob(body.source, body.target, body.payload);
  }

  @Get('pending')
  @Roles(UserRole.ADMINISTRATOR)
  async pending() {
    return this.integration.processPendingJobs();
  }
}
