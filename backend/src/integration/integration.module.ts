import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';
import { IntegrationOrchestratorService } from './integration-orchestrator.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [IntegrationController], providers: [IntegrationService, IntegrationWorkerService, IntegrationOrchestratorService, PrismaService] })
export class IntegrationModule {}
