import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('teams')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMINISTRATOR)
export class TeamsController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list() {
    const teams = await this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            assignments: true
          }
        }
      }
    });

    return { teams };
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { name: string }
  ) {
    const name = body.name?.trim();

    if (!name) {
      throw new BadRequestException('Team name is required');
    }

    const existing = await this.prisma.team.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive'
        }
      }
    });

    if (existing) {
      throw new ConflictException('Team name already exists');
    }

    const team = await this.prisma.team.create({
      data: { name }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'TEAM_CREATED',
        details: {
          teamId: team.id,
          name: team.name
        }
      }
    });

    return { created: true, team };
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name: string }
  ) {
    const name = body.name?.trim();

    if (!name) {
      throw new BadRequestException('Team name is required');
    }

    const existing = await this.prisma.team.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundException('Team not found');
    }

    const duplicate = await this.prisma.team.findFirst({
      where: {
        name: {
          equals: name,
          mode: 'insensitive'
        },
        NOT: { id }
      }
    });

    if (duplicate) {
      throw new ConflictException('Team name already exists');
    }

    const team = await this.prisma.team.update({
      where: { id },
      data: { name }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: req.user.id,
        action: 'TEAM_UPDATED',
        details: {
          teamId: team.id,
          previousName: existing.name,
          name: team.name
        }
      }
    });

    return { updated: true, team };
  }

  @Delete(':id')
  async remove(
    @Req() req: any,
    @Param('id') id: string
  ) {
    const existing = await this.prisma.team.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            assignments: true
          }
        }
      }
    });

    if (!existing) {
      throw new NotFoundException('Team not found');
    }

    if (existing._count.users > 0) {
      throw new ConflictException(
        'Team still has users assigned. Reassign or remove the users from the team before deleting it.'
      );
    }

    if (existing._count.assignments > 0) {
      throw new ConflictException(
        'Team has assignment history and cannot be permanently deleted.'
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.team.delete({
        where: { id }
      });

      await tx.auditLog.create({
        data: {
          actorId: req.user.id,
          action: 'TEAM_DELETED',
          details: {
            deletedTeamId: existing.id,
            name: existing.name
          }
        }
      });
    });

    return {
      deleted: true,
      teamId: existing.id
    };
  }
}
