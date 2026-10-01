import { Module } from '@nestjs/common';
import { FieldController } from './field.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({ imports: [AuthModule], controllers: [FieldController], providers: [PrismaService] })
export class FieldModule {}
