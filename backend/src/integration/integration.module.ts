import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';
import { IntegrationOrchestratorService } from './integration-orchestrator.service';
import { IntegrationExecutorService } from './integration-executor.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [IntegrationController], providers: [IntegrationService, IntegrationWorkerService, IntegrationOrchestratorService, IntegrationExecutorService, PrismaService] })
export class IntegrationModule {}
