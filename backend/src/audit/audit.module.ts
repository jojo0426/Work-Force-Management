import { Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [AuditController], providers: [PrismaService] })
export class AuditModule {}
