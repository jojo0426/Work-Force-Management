import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersPhase2Service } from './work-orders-phase2.service';
import { EvidenceStorageService } from './evidence-storage.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrdersPhase2Service, EvidenceStorageService, PrismaService]
})
export class WorkOrdersModule {}
