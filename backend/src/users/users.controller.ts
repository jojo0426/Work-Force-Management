import { BadRequestException, Body, ConflictException, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRATOR)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, phone: true, role: true, teamId: true, status: true, isActive: true, createdAt: true }
    });
    return { users };
  }

  @Post()
  async create(@Req() req: any, @Body() body: { name: string; email: string; password: string; role: UserRole; phone?: string; teamId?: string }) {
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    if (!name || !email || !body.password) throw new BadRequestException('Name, email and password are required');
    if (body.password.length < 12) throw new BadRequestException('Password must contain at least 12 characters');
    if (!Object.values(UserRole).includes(body.role)) throw new BadRequestException('Invalid role');

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email is already registered');

    if (body.teamId) {
      const team = await this.prisma.team.findUnique({ where: { id: body.teamId } });
      if (!team) throw new BadRequestException('Team does not exist');
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await this.prisma.user.create({
      data: { name, email, phone: body.phone?.trim() || null, passwordHash, role: body.role, teamId: body.teamId || null, status: UserStatus.OFFLINE, isActive: true },
      select: { id: true, name: true, email: true, phone: true, role: true, teamId: true, status: true, isActive: true, createdAt: true }
    });
    await this.prisma.auditLog.create({ data: { actorId: req.user.id, action: 'USER_CREATED', details: { userId: user.id, role: user.role, teamId: user.teamId } } });
    return { created: true, user };
  }

  @Patch(':id/status')
  async setActive(@Req() req: any, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    if (typeof body.isActive !== 'boolean') throw new BadRequestException('isActive must be boolean');
    if (id === req.user.id && body.isActive === false) throw new BadRequestException('Administrator cannot disable the currently authenticated account');

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: body.isActive, status: body.isActive ? undefined : UserStatus.OFFLINE },
      select: { id: true, name: true, email: true, role: true, teamId: true, status: true, isActive: true }
    });
    await this.prisma.auditLog.create({ data: { actorId: req.user.id, action: body.isActive ? 'USER_ENABLED' : 'USER_DISABLED', details: { userId: user.id, role: user.role } } });
    return { updated: true, user };
  }
}
