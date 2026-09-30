import { Module } from '@nestjs/common';
import { FieldController } from './field.controller';
import { PrismaService } from '../prisma.service';

@Module({ controllers: [FieldController], providers: [PrismaService] })
export class FieldModule {}
