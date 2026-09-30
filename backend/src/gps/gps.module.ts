import { Module } from '@nestjs/common';
import { GpsGateway } from './gps.gateway';
import { GpsController } from './gps.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [GpsController], providers: [GpsGateway, PrismaService] })
export class GpsModule {}
