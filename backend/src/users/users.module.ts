import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { TeamsController } from './teams.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [UsersController, TeamsController],
  providers: [PrismaService]
})
export class UsersModule {}