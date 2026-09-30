import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { Phase4Service } from './phase4.service';

@Controller('phase4')
export class Phase4Controller {
  constructor(private phase4: Phase4Service) {}

  @Post('signature')
  async saveSignature(@Body() body: any) {
    return this.phase4.saveSignature(body);
  }

  @Get('route/optimize')
  async optimizeRoute(@Query('technicianId') techId: string, @Query('date') date: string) {
    return this.phase4.optimizeRoute(techId || 'demo-tech-1', date || new Date().toISOString().split('T')[0]);
  }

  @Get('analytics/advanced')
  async advancedAnalytics(@Query('range') range: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.phase4.getAdvancedAnalytics(range || 'monthly', from, to);
  }

  @Post('workflows/rules')
  async createRule(@Body() body: any) {
    return this.phase4.createWorkflowRule(body);
  }

  @Post('workflows/trigger')
  async trigger(@Body() body: { event: string, workOrderId: string }) {
    return this.phase4.triggerWorkflow(body.event, body.workOrderId);
  }

  @Get('network/health')
  async napHealth() {
    return this.phase4.getNapHealth();
  }
}
