import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Future API Architecture — prepare WFM for multiple API integrations
// Should not tightly connect technician app directly to every external system
// Instead: Technician App + Web Portal -> WFM API -> Integration Layer -> API1, API2, API3, API4, Future API
// Gives flexibility to connect other FiberBlaze/Meridian systems later without rebuilding technician app

@Injectable()
export class IntegrationService {
  constructor(private prisma: PrismaService) {}

  async queueIntegrationJob(source: string, target: string, payload: any) {
    const job = await this.prisma.integrationJob.create({
      data: {
        sourceSystem: source,
        targetSystem: target,
        payload,
        status: 'PENDING'
      } as any
    });
    return job;
  }

  async processPendingJobs() {
    const pending = await this.prisma.integrationJob.findMany({ where: { status: 'PENDING' }, take: 10 });
    // In production: process each via webhook, message queue, etc
    return { pending: pending.length, jobs: pending };
  }

  async getIntegrationArchitecture() {
    return {
      architecture: 'Technician App + Web Portal -> WFM API -> Integration Layer -> API1, API2, API3, API4, Future API',
      benefits: 'Flexibility to connect other FiberBlaze/Meridian systems later without rebuilding technician app',
      preparedApis: [
        { name: 'API 1', description: 'Billing / Subscriber System (future)', status: 'PREPARED' },
        { name: 'API 2', description: 'Network Inventory / NAP Management (future)', status: 'PREPARED' },
        { name: 'API 3', description: 'CRM / Customer Management (future)', status: 'PREPARED' },
        { name: 'API 4', description: 'Notification / SMS Gateway (future)', status: 'PREPARED' },
        { name: 'Future API', description: 'Digital signatures, analytics, route optimization (Phase 4)', status: 'PLANNED' }
      ],
      currentIntegration: 'WFM API acts as central gateway — technician app never talks directly to external systems'
    };
  }
}
