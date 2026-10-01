import { Module, OnModuleInit } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersPhase2Service } from './work-orders-phase2.service';
import { EvidenceStorageService } from './evidence-storage.service';
import { EvidenceRegistrationService } from './evidence-registration.service';
import { S3EvidenceStorageProvider } from './s3-evidence-storage.provider';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrdersPhase2Service, EvidenceStorageService, EvidenceRegistrationService, S3EvidenceStorageProvider, PrismaService]
})
export class WorkOrdersModule implements OnModuleInit {
  constructor(private evidenceStorage: EvidenceStorageService, private s3Provider: S3EvidenceStorageProvider) {}
  onModuleInit() {
    if (this.s3Provider.isConfigured()) this.evidenceStorage.registerProvider(this.s3Provider);
  }
}
