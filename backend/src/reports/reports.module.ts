import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsPhase3Service } from './reports-phase3.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [ReportsController], providers: [ReportsPhase3Service, PrismaService] })
export class ReportsModule {}
