import { Controller, Get, Param, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get(':workOrderId')
  @Roles(UserRole.TECHNICIAN, UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async getAuditTrail(@Req() req: any, @Param('workOrderId') workOrderId: string) {
    if (req.user.role === UserRole.TECHNICIAN) {
      if (!req.user.teamId) throw new ForbiddenException('Technician is not assigned to a team');
      const assignment = await this.prisma.assignment.findFirst({ where: { workOrderId, teamId: req.user.teamId } });
      if (!assignment) throw new ForbiddenException('Audit trail is limited to work orders assigned to your team');
    }

    const logs = await this.prisma.auditLog.findMany({ where: { workOrderId }, orderBy: { createdAt: 'asc' } });
    const enriched = logs.map((log:any) => ({
      timestamp: log.createdAt,
      time: new Date(log.createdAt).toLocaleTimeString(),
      action: log.action,
      actorId: log.actorId,
      details: log.details,
      display: `${new Date(log.createdAt).toLocaleTimeString()} — ${log.action} by ${log.actorId || 'system'}`
    }));
    return { workOrderId, timeline: enriched };
  }

  @Get('technician/:technicianId')
  @Roles(UserRole.JOB_CONTROLLER, UserRole.SUPERVISOR, UserRole.ADMINISTRATOR)
  async techAudit(@Param('technicianId') techId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const where: any = { actorId: techId };
    if (from && to) where.createdAt = { gte: new Date(from), lte: new Date(to) };
    const logs = await this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    return { technicianId: techId, logs };
  }
}
