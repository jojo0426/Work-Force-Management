import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
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

  private readonly publicUserSelect = {
    id: true,
    name: true,
    email: true,
    phone: true,
    role: true,
    teamId: true,
    status: true,
    isActive: true,
    createdAt: true
  } as const;

  @Get()
  async list() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: this.publicUserSelect
    });

    return { users };
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: {
      name: string;
      email: string;
      password: string;
      role: UserRole;
      phone?: string;
      teamId?: string;
    }
  ) {
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();

    if (!name || !email || !body.password) {
      throw new BadRequestException('Name, email and password are required');
    }

    if (body.password.length < 12) {
      throw new BadRequestException('Password must contain at least 12 characters');
    }

    if (!Object.values(UserRole).includes(body.role)) {
      throw new BadRequestException('Invalid role');
    }

    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    if (body.teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: body.teamId }
      });

      if (!team) {
        throw new BadRequestException('Team does not exist');
      }
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        phone: body.phone?.trim() || null,
        passwordHash,
        role: body.role,
        teamId: body.teamId || null,
        status: UserStatus.OFFLINE,
        isActive: true
      },
      select: this.publicUserSelect
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'USER_CREATED',
        details: {
          userId: user.id,
          role: user.role,
          teamId: user.teamId
        }
      }
    });

    return { created: true, user };
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      email?: string;
      phone?: string | null;
      role?: UserRole;
      teamId?: string | null;
    }
  ) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: this.publicUserSelect
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const data: {
      name?: string;
      email?: string;
      phone?: string | null;
      role?: UserRole;
      teamId?: string | null;
    } = {};

    if ('name' in body) {
      const name = body.name?.trim();

      if (!name) {
        throw new BadRequestException('Name is required');
      }

      data.name = name;
    }

    if ('email' in body) {
      const email = body.email?.trim().toLowerCase();

      if (!email) {
        throw new BadRequestException('Email is required');
      }

      const duplicate = await this.prisma.user.findUnique({
        where: { email }
      });

      if (duplicate && duplicate.id !== id) {
        throw new ConflictException('Email is already registered');
      }

      data.email = email;
    }

    if ('phone' in body) {
      data.phone = body.phone?.trim() || null;
    }

    if ('role' in body) {
      if (!body.role || !Object.values(UserRole).includes(body.role)) {
        throw new BadRequestException('Invalid role');
      }

      if (id === req.user.id && body.role !== UserRole.ADMINISTRATOR) {
        throw new BadRequestException(
          'Administrator cannot remove administrator role from the currently authenticated account'
        );
      }

      data.role = body.role;
    }

    if ('teamId' in body) {
      const nextTeamId = body.teamId || null;

      if (nextTeamId) {
        const team = await this.prisma.team.findUnique({
          where: { id: nextTeamId }
        });

        if (!team) {
          throw new BadRequestException('Team does not exist');
        }
      }

      if (nextTeamId !== existing.teamId) {
        const activeExecution = await this.prisma.jobExecution.findFirst({
          where: {
            technicianId: id,
            completedAt: null
          },
          select: { id: true }
        });

        if (activeExecution) {
          throw new BadRequestException(
            'Technician cannot be transferred to another team while a work execution is active'
          );
        }
      }

      data.teamId = nextTeamId;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No editable user fields supplied');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: this.publicUserSelect
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'USER_UPDATED',
        details: {
          userId: user.id,
          changedFields: Object.keys(data),
          previousRole: existing.role,
          role: user.role,
          previousTeamId: existing.teamId,
          teamId: user.teamId
        }
      }
    });

    return { updated: true, user };
  }

  @Patch(':id/password')
  async resetPassword(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { password: string }
  ) {
    if (!body.password) {
      throw new BadRequestException('Password is required');
    }

    if (body.password.length < 12) {
      throw new BadRequestException('Password must contain at least 12 characters');
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'USER_PASSWORD_RESET',
        details: { userId: id }
      }
    });

    return { updated: true };
  }

  @Patch(':id/status')
  async setActive(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { isActive: boolean }
  ) {
    if (typeof body.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be boolean');
    }

    if (id === req.user.id && body.isActive === false) {
      throw new BadRequestException(
        'Administrator cannot disable the currently authenticated account'
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: body.isActive,
        status: body.isActive ? undefined : UserStatus.OFFLINE
      },
      select: this.publicUserSelect
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: body.isActive ? 'USER_ENABLED' : 'USER_DISABLED',
        details: {
          userId: user.id,
          role: user.role
        }
      }
    });

    return { updated: true, user };
  }

  @Delete(':id')
  async remove(
    @Req() req: any,
    @Param('id') id: string
  ) {
    if (id === req.user.id) {
      throw new BadRequestException(
        'Administrator cannot delete the currently authenticated account'
      );
    }

    const existing = await this.prisma.user.findUnique({
      where: { id },
      select: this.publicUserSelect
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const [
      createdWorkOrder,
      assignedWorkOrder,
      audit,
      history1,
      history2,
      history3,
      history4,
      history5,
      history6
    ] = await Promise.all([
      this.prisma.workOrder.findFirst({
        where: { createdBy: id },
        select: { id: true }
      }),
      this.prisma.assignment.findFirst({
        where: { assignedBy: id },
        select: { id: true }
      }),
      this.prisma.auditLog.findFirst({
        where: { actorId: id },
        select: { id: true }
      }),
      this.prisma.jobExecution.findFirst({
        where: { technicianId: id },
        select: { id: true }
      }),
      this.prisma.fieldException.findFirst({
        where: { technicianId: id },
        select: { id: true }
      }),
      this.prisma.evidenceUploadTicket.findFirst({
        where: { technicianId: id },
        select: { id: true }
      }),
      this.prisma.optimizedRoute.findFirst({
        where: { technicianId: id },
        select: { id: true }
      }),
      this.prisma.routeHistory.findFirst({
        where: { technicianId: id },
        select: { id: true }
      }),
      this.prisma.locationLog.findFirst({
        where: { userId: id },
        select: { id: true }
      })
    ]);

    if (
      createdWorkOrder ||
      assignedWorkOrder ||
      audit ||
      history1 ||
      history2 ||
      history3 ||
      history4 ||
      history5 ||
      history6
    ) {
      throw new ConflictException(
        'User has operational or audit history and cannot be permanently deleted. Disable the account instead.'
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.delete({
        where: { id }
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'USER_DELETED',
          details: {
            deletedUserId: existing.id,
            name: existing.name,
            email: existing.email,
            role: existing.role,
            teamId: existing.teamId
          }
        }
      });
    });

    return {
      deleted: true,
      userId: existing.id
    };
  }
}
