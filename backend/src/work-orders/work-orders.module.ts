import { Module } from '@nestjs/common';
import { WorkOrdersController } from './work-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrdersPhase2Service } from './work-orders-phase2.service';
import { PrismaService } from '../prisma.service';
@Module({ controllers: [WorkOrdersController], providers: [WorkOrdersService, WorkOrdersPhase2Service, PrismaService] })
export class WorkOrdersModule {}
