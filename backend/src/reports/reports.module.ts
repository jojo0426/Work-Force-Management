import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { PrismaService } from '../prisma.service';
@Module({ controllers: [ReportsController], providers: [PrismaService] })
export class ReportsModule {}
