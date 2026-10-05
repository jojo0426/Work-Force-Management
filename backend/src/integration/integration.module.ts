import { Module } from '@nestjs/common';
import { IntegrationController } from './integration.controller';
import { IntegrationService } from './integration.service';
import { IntegrationWorkerService } from './integration-worker.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [IntegrationController], providers: [IntegrationService, IntegrationWorkerService, PrismaService] })
export class IntegrationModule {}
