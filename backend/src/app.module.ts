import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { FieldModule } from './field/field.module';
import { GpsModule } from './gps/gps.module';
import { ReportsModule } from './reports/reports.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    WorkOrdersModule,
    FieldModule,
    GpsModule,
    ReportsModule
  ],
  providers: [PrismaService],
  exports: [PrismaService]
})
export class AppModule {}
