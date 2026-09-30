import { Controller, Get, Post, Body } from '@nestjs/common';
import { IntegrationService } from './integration.service';

@Controller('integration')
export class IntegrationController {
  constructor(private integration: IntegrationService) {}

  @Get('architecture')
  async architecture() {
    return this.integration.getIntegrationArchitecture();
  }

  @Post('queue')
  async queue(@Body() body: { source: string, target: string, payload: any }) {
    return this.integration.queueIntegrationJob(body.source, body.target, body.payload);
  }

  @Get('pending')
  async pending() {
    return this.integration.processPendingJobs();
  }
}
