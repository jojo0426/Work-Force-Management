import { Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Controller('audit')
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Get(':workOrderId')
  async getAuditTrail(@Param('workOrderId') workOrderId: string) {
    // Audit Trail: Important activities should have history
    // 09:03 WO assigned by Controller
    // 09:27 Technician started job
    // 09:29 GPS recorded
    // 09:42 Photo captured
    // 09:51 Signal measurement entered
    // 10:05 WO completed
    // Changes to verified info should identify who changed it, when, why
    const logs = await this.prisma.auditLog.findMany({
      where: { workOrderId },
      orderBy: { createdAt: 'asc' }
    });

    const enriched = logs.map((log:any) => ({
      timestamp: log.createdAt,
      time: new Date(log.createdAt).toLocaleTimeString(),
      action: log.action,
      actorId: log.actorId,
      details: log.details,
      // Human readable
      display: `${new Date(log.createdAt).toLocaleTimeString()} — ${log.action} by ${log.actorId || 'system'}`
    }));

    return {
      workOrderId,
      timeline: enriched,
      // Example format from blueprint
      example: [
        '09:03 — WO assigned by Controller',
        '09:27 — Technician started job',
        '09:29 — GPS recorded',
        '09:42 — Photo captured',
        '09:51 — Signal measurement entered',
        '10:05 — WO completed'
      ]
    };
  }

  @Get('technician/:technicianId')
  async techAudit(@Param('technicianId') techId: string, @Query('from') from?: string, @Query('to') to?: string) {
    const where: any = { actorId: techId };
    if (from && to) where.createdAt = { gte: new Date(from), lte: new Date(to) };
    const logs = await this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
    return { technicianId: techId, logs };
  }
}
