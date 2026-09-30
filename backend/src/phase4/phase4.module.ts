import { Module } from '@nestjs/common';
import { Phase4Controller } from './phase4.controller';
import { Phase4Service } from './phase4.service';
import { PrismaService } from '../prisma.service';
@Module({ controllers: [Phase4Controller], providers: [Phase4Service, PrismaService] })
export class Phase4Module {}
